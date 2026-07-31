import type { Request, RequestHandler, Response, Router } from 'express';
import type { JWTPayload } from 'jose';

/** Scopes ONEIDP accepts. Anything else is rejected at the authorize endpoint. */
export type OneidpScope = 'openid' | 'profile' | 'email' | 'offline_access';

/** ONEIDP claim names normalised, with the original claims kept on `raw`. */
export interface OneidpUser {
  /** Stable internal user id. The only safe primary key for a user. */
  sub: string;
  username: string | null;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  /** Roles defined on your client that the user belongs to. Needs `profile`. */
  roles: string[];
  /** Whether the account has TOTP configured, not whether it was used to log in. */
  mfaEnabled: boolean | null;
  raw: Record<string, unknown>;
}

export interface OneidpTokens {
  accessToken: string;
  idToken: string | null;
  tokenType: string;
  /** Derived from `expires_in`. Never from the ID token, which lives 48 hours. */
  expiresAt: number | null;
  isExpired: boolean;
}

export interface TokenSet {
  accessToken: string;
  idToken: string | null;
  refreshToken: string | null;
  tokenType: string;
  expiresIn: number | null;
  expiresAt: number | null;
}

export interface CodeExchangeResult extends TokenSet {
  claims: JWTPayload & Record<string, unknown>;
  user: OneidpUser;
}

export interface AuthorizationState {
  state: string;
  nonce: string;
  codeVerifier: string | null;
  createdAt: number;
}

export interface OneidpEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint: string;
  revocation_endpoint: string;
  jwks_uri: string;
  check_token_endpoint: string;
}

export interface ClientOptions {
  /** Instance base URL, and the `iss` claim of every token. No trailing slash. */
  issuer: string;
  clientId: string;
  /** Omit for public clients. Required to refresh or revoke. */
  clientSecret?: string;
  /**
   * The single URI registered for this client, compared byte for byte. It cannot
   * contain a query string: ONEIDP's registration regex rejects `?`, `&`, `=`
   * and `%`. Not needed by `bearerAuth`.
   */
  redirectUri?: string;
  scope?: string | OneidpScope[];
  /** Send PKCE (S256). Default true. Required for public clients. */
  pkce?: boolean;
  /** Leeway in seconds for `exp`/`iat`. Default 5. */
  clockTolerance?: number;
  /** Request timeout in ms. Default 10000. */
  timeout?: number;
  /**
   * Fetch the discovery document once, lazily. Default true. A failure is not
   * fatal: the standard ONEIDP endpoint paths are used instead.
   */
  discovery?: boolean;
  endpoints?: Partial<OneidpEndpoints>;
  fetch?: typeof globalThis.fetch;
  onWarning?: (message: string) => void;
}

export declare class OneidpClient {
  constructor(options: ClientOptions);

  readonly issuer: string;
  readonly clientId: string;
  readonly scope: string;
  readonly redirectUri: string | null;
  readonly isConfidential: boolean;
  readonly canRefresh: boolean;

  endpoints(): Promise<OneidpEndpoints>;

  createAuthorizationState(): AuthorizationState;

  buildAuthorizationUrl(options?: {
    state?: string;
    nonce?: string;
    codeVerifier?: string | null;
    scope?: string | OneidpScope[];
    redirectUri?: string;
  }): Promise<string>;

  /** Exchange within 20 seconds: codes are single use and expire fast. */
  exchangeCode(
    code: string,
    options?: { codeVerifier?: string | null; nonce?: string | null; redirectUri?: string },
  ): Promise<CodeExchangeResult>;

  /**
   * Confidential clients only. The returned ID token carries base claims only,
   * and no new refresh token is issued.
   */
  refresh(refreshToken: string): Promise<TokenSet & { claims: JWTPayload | null }>;

  validateIdToken(
    idToken: string,
    options?: { nonce?: string | null },
  ): Promise<JWTPayload & Record<string, unknown>>;

  /** Signature, `iss`, `aud`, `exp`. Add `verifySession` to catch revocation. */
  validateAccessToken(
    accessToken: string,
    options?: { verifySession?: boolean; audience?: string },
  ): Promise<JWTPayload & Record<string, unknown>>;

  decode(token: string): JWTPayload;

  userinfo(accessToken: string): Promise<OneidpUser>;

  /** Whether the session behind the token is still live. */
  checkToken(accessToken: string): Promise<boolean>;

  /**
   * Ends the access token's session. Cannot revoke refresh tokens, and the
   * endpoint reports success regardless of outcome.
   */
  revoke(accessToken: string): Promise<boolean>;

  buildLogoutUrl(options?: { idToken?: string | null; postLogoutRedirectUri?: string }): Promise<string>;
}

export declare function createClient(options: ClientOptions): OneidpClient;

export declare function mapClaimsToUser(claims: Record<string, unknown>): OneidpUser;

/** Sign-in state for the current request, exposed as `req.oneidp`. */
export interface OneidpContext {
  readonly client: OneidpClient;
  /** How this request authenticated. */
  readonly authMethod: 'session' | 'bearer' | null;
  readonly isAuthenticated: boolean;
  readonly user: OneidpUser | null;
  readonly claims: Record<string, unknown> | null;
  readonly tokens: OneidpTokens | null;
  /** Verified access token claims, when a bearer token authenticated the request. */
  readonly tokenPayload: (JWTPayload & Record<string, unknown>) | null;

  hasRole(...roles: Array<string | string[]>): boolean;
  hasAllRoles(...roles: Array<string | string[]>): boolean;

  /**
   * A usable access token, refreshed when near expiry. Null when a fresh login is
   * needed. Call it before writing the response so a refreshed token can be
   * stored in the cookie.
   */
  getAccessToken(): Promise<string | null>;
  userinfo(options?: { cache?: boolean }): Promise<OneidpUser | null>;
  isSessionActive(): Promise<boolean>;

  /** Null when the context came from a standalone `bearerAuth`. */
  loginUrl(returnTo?: string | null): string | null;
  logoutUrl(): string | null;
  /** Clear the session cookie without contacting the IdP. */
  destroy(): Promise<void>;
}

export interface CookieOptions {
  /** Session cookie name. The login transaction uses `${name}_tx`. Default `oneidp`. */
  name?: string;
  path?: string;
  domain?: string;
  /** `strict` is rejected: it breaks the callback navigation. Default `lax`. */
  sameSite?: 'lax' | 'none';
  /** Defaults to true unless `redirectUri` is http on localhost. */
  secure?: boolean;
  /** Session lifetime in ms. Default 12 hours. */
  maxAge?: number;
  /** How long a login may sit unfinished, in ms. Default 10 minutes. */
  txMaxAge?: number;
}

export interface RouteOptions {
  /** Default `/auth/login`. */
  login?: string;
  /** Default `/auth/logout`. */
  logout?: string;
  /** Defaults to the path of `redirectUri`. */
  callback?: string;
  /** JSON profile route. Off unless set. */
  me?: string | null;
}

export interface MiddlewareOptions extends ClientOptions {
  redirectUri: string;
  /**
   * Seals the session and login cookies. At least 32 characters, identical on
   * every instance. Pass `[next, current]` to rotate without signing anyone out.
   */
  secret: string | string[];
  cookie?: CookieOptions;
  routes?: RouteOptions;
  /** Where to land after login when no `returnTo` was given. Default `/`. */
  defaultReturnTo?: string;
  /** Not validated by ONEIDP, so never build it from user input. */
  postLogoutRedirectUri?: string | null;
  /** Refresh this many ms before expiry. Default 60000. */
  refreshSkew?: number;
  /** Re-read the profile after a refresh, since refreshed ID tokens drop claims. */
  refreshUserinfo?: boolean;
  /** Use userinfo rather than ID token claims for the profile. Default false. */
  fetchUserinfoOnLogin?: boolean;
  /** Best-effort token revocation on logout. Default true. */
  revokeOnLogout?: boolean;
  /** Redirect through the IdP's end_session endpoint. Default true. */
  endSessionOnLogout?: boolean;
  /** Return false, or respond yourself, to take over the post-login redirect. */
  onLogin?: (
    req: Request,
    res: Response,
    details: { user: OneidpUser; tokens: CodeExchangeResult },
  ) => void | boolean | Promise<void | boolean>;
  onError?: (error: unknown, req: Request, res: Response, next: (err?: unknown) => void) => void | Promise<void>;
  /** Supply a pre-built client instead of the client options above. */
  client?: OneidpClient;
}

export interface RequireAuthOptions {
  /** Remember the current URL and return to it after login. Default true. */
  returnTo?: boolean;
}

export interface RequireRolesOptions {
  /** `any` (default) passes with one matching role; `all` needs every one. */
  mode?: 'any' | 'all';
  onDenied?: RequestHandler;
}

export interface BearerGuardOptions {
  /**
   * Also confirm the session is live at the IdP. Revocation in ONEIDP is
   * session-based, so local validation alone keeps accepting revoked tokens
   * until they expire.
   */
  verifySession?: boolean;
  /** Load the profile, which the access token itself does not carry. */
  loadUserinfo?: boolean;
  audience?: string;
  /** Continue without a token instead of returning 401. Default true. */
  required?: boolean;
}

/** Standalone guard options: client configuration plus guard behaviour. */
export interface BearerAuthOptions extends ClientOptions, BearerGuardOptions {
  client?: OneidpClient;
  refreshSkew?: number;
}

/** Guards work as `auth.requireAuth` or `auth.requireAuth({ ... })`. */
export type FlexibleGuard<O> = RequestHandler & ((options?: O) => RequestHandler);

export interface OneidpRouter extends Router {
  client: OneidpClient;
  routes: Required<RouteOptions>;
  requireAuth: FlexibleGuard<RequireAuthOptions>;
  requireRoles: (...roles: Array<string | string[] | RequireRolesOptions>) => RequestHandler;
  bearerAuth: FlexibleGuard<BearerGuardOptions>;
  context: (req: Request, res: Response) => OneidpContext;
}

/** Mount the login, callback and logout routes, and populate `req.oneidp`. */
export declare function oneidp(options: MiddlewareOptions): OneidpRouter;
export default oneidp;

/**
 * Verify `Authorization: Bearer` access tokens. Needs no secret, no cookie and
 * no redirect URI: the right choice for an API.
 */
export declare function bearerAuth(options: BearerAuthOptions): RequestHandler;

export declare function defaultEndpoints(issuer: string): OneidpEndpoints;
export declare function randomState(): string;
export declare function randomNonce(): string;
export declare function randomCodeVerifier(): string;
export declare function codeChallenge(verifier: string): string;

export declare class OneidpError extends Error {
  code: string;
  status?: number;
  /** Extra context for failures that are easy to misdiagnose. */
  hint?: string;
}
export declare class ConfigurationError extends OneidpError {}
export declare class DiscoveryError extends OneidpError {}
export declare class TokenError extends OneidpError {}
export declare class IdTokenError extends OneidpError {}
export declare class CallbackError extends OneidpError {}
export declare class ApiError extends OneidpError {}

declare global {
  namespace Express {
    interface Request {
      oneidp: OneidpContext;
    }
    interface Locals {
      oneidp: OneidpContext;
      user: OneidpUser | null;
    }
  }
}
