import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { useConfig } from '@/config/ConfigProvider';
import { AuthDivider, SocialAuth } from '@/components/SocialAuth';
import { Button } from '@/components/ui/Button';
import { PasswordInput, TextInput } from '@/components/ui/Field';
import { IconKey } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { leaveTo, readRedirectUri, withRedirectUri } from '@/lib/redirect-uri';
import { describePasskeyError, getAssertion, isPasskeySupported } from '@/lib/webauthn';

/** Messages for the `?error=` codes the social callbacks redirect back with. */
const CALLBACK_ERRORS = {
  banned: 'This account has been suspended.',
  maintenance: 'ONEIDP is temporarily unavailable for maintenance.',
  registration_closed: 'Registrations are currently closed, so a new account could not be created.',
  domain_not_allowed: 'That email domain is not permitted on this instance.',
  social_disabled: 'Signing in with Google or GitHub is currently disabled.',
  social_failed: 'That sign-in could not be completed. Please try again.',
};

export function LoginPage() {
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);

  const canSubmit = identifier.trim() !== '' && password.trim() !== '';
  const redirectUri = readRedirectUri();
  const config = useConfig();
  const [searchParams, setSearchParams] = useSearchParams();

  // Surface the reason a social sign-in bounced back, then clear it so the
  // message does not reappear on reload.
  useEffect(() => {
    const code = searchParams.get('error');
    if (!code) return;
    toast.error(CALLBACK_ERRORS[code] || CALLBACK_ERRORS.social_failed);
    const next = new URLSearchParams(searchParams);
    next.delete('error');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || pending) return;

    setPending(true);
    try {
      // 461/462/463 are meaningful outcomes, not failures: unverified email,
      // bad credentials, and "MFA required" respectively. 403 is a suspended
      // account and 503 is maintenance mode.
      const { status, data } = await api.post(
        '/api/auth/login',
        { username_or_email: identifier, password },
        { expect: [403, 460, 461, 462, 463, 503] },
      );

      if (status === 403 || status === 503) {
        toast.error(data?.error || 'Sign-in is not available for this account.');
        setPassword('');
        setPending(false);
        return;
      }

      if (status === 200) {
        leaveTo(redirectUri);
        return;
      }

      if (status === 461) {
        toast.error('Please verify your email address to continue.');
        const email = encodeURIComponent(data?.email || '');
        window.location.assign(withRedirectUri(`/verify?email=${email}`, redirectUri));
        return;
      }

      if (status === 463) {
        window.location.assign(withRedirectUri('/mfa', redirectUri));
        return;
      }

      // 462 and anything else unexpected: never reveal which half was wrong.
      toast.error('Username or password is incorrect.');
      setPassword('');
      setPending(false);
    } catch (error) {
      toast.error(error.message || 'Something went wrong. Please try again.');
      setPending(false);
    }
  };

  const handlePasskey = async () => {
    setPasskeyPending(true);
    try {
      const { data: options } = await api.post('/api/auth/passkey');
      const assertion = await getAssertion(options);
      await api.post('/api/auth/passkey/verify', { response: assertion });
      leaveTo(redirectUri);
    } catch (error) {
      toast.error(describePasskeyError(error));
      setPasskeyPending(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your ONEIDP account to continue."
      footer={
        config.registrationEnabled ? (
          <>
            Need an account?{' '}
            <Link
              to={withRedirectUri('/signup', redirectUri)}
              className="font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Create one
            </Link>
          </>
        ) : (
          <>Registration is invitation only. Ask an administrator for access.</>
        )
      }
    >
      {config.maintenanceMode && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-[#f6d488]"
        >
          {config.maintenanceMessage || 'ONEIDP is temporarily unavailable for maintenance.'}
        </div>
      )}

      {/* Two annotations per field, because managers disagree on what they read:
          `autocomplete` plus id/name for the browser, Bitwarden and 1Password,
          and `data-form-type` (Dashlane's SAWF spec) for Dashlane, which does
          not infer sign-in forms from `autocomplete` alone. */}
      <form
        id="login-form"
        name="login"
        data-form-type="login"
        // The submit is handled in JS, but `action`/`method` are still declared:
        // form classifiers read them as part of deciding that this is a
        // credential form, and an attribute-less <form> reads as inert.
        action="/api/auth/login"
        method="post"
        onSubmit={handleSubmit}
        className="space-y-4"
        aria-label="Sign in"
        noValidate
      >
        <TextInput
          label="Username or email"
          id="username"
          name="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          data-form-type="username,email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />

        <div className="space-y-1.5">
          <PasswordInput
            id="current-password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            data-form-type="password"
            enterKeyHint="go"
            required
          />
          {config.passwordResetEnabled && (
            <div className="flex justify-end">
              <Link
                to={withRedirectUri('/recovery', redirectUri)}
                data-form-type="action,forgot_password"
                className="rounded text-xs text-ink-muted transition-colors hover:text-ink"
              >
                Forgot your password?
              </Link>
            </div>
          )}
        </div>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={pending}
          disabled={!canSubmit}
          data-form-type="action,login"
        >
          Sign in
        </Button>
      </form>

      {isPasskeySupported() && (
        <div className="mt-4">
          <Button
            variant="secondary"
            fullWidth
            size="lg"
            onClick={handlePasskey}
            loading={passkeyPending}
            // Sits outside the credential form; not the form's submit control.
            data-form-type="other"
          >
            <IconKey size={18} />
            Sign in with a passkey
          </Button>
        </div>
      )}

      {config.socialLoginEnabled && (
        <div className="mt-5 space-y-4">
          <AuthDivider />
          <SocialAuth disabled={pending || passkeyPending} />
        </div>
      )}
    </AuthLayout>
  );
}
