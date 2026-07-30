import { Button } from '@/components/ui/Button';
import { IconGitHub, IconGoogle } from '@/components/ui/Icons';
import { readRedirectUri } from '@/lib/redirect-uri';

/**
 * Google / GitHub sign-in.
 *
 * These are full-page navigations rather than fetches: the OAuth handshake ends
 * with the API setting the session cookie and redirecting back, which a fetch
 * cannot follow.
 */
export function SocialAuth({ disabled = false }) {
  const start = (provider) => {
    const redirectUri = readRedirectUri();
    const query = redirectUri ? `?redirectUri=${redirectUri}` : '';
    window.location.assign(`/api/auth/${provider}${query}`);
  };

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <Button variant="secondary" onClick={() => start('google')} disabled={disabled} fullWidth>
        <IconGoogle />
        Google
      </Button>
      <Button variant="secondary" onClick={() => start('github')} disabled={disabled} fullWidth>
        <IconGitHub />
        GitHub
      </Button>
    </div>
  );
}

/** "or" rule between the credential form and the social buttons. */
export function AuthDivider({ label = 'or continue with' }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-hairline" />
      <span className="text-xs tracking-wide text-ink-faint uppercase">{label}</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}
