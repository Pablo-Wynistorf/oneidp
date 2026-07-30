import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { IconMail } from '@/components/ui/Icons';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { leaveTo, readRedirectUri, withRedirectUri } from '@/lib/redirect-uri';

const POLL_INTERVAL_MS = 10_000;

/**
 * "Check your inbox" screen.
 *
 * The verification link lands on the API, which sets the session cookie. This
 * page polls `exchange-signup-token` so the tab the user started in follows
 * along automatically once they click the link (possibly on another device).
 */
export function VerifyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [email] = useState(() => searchParams.get('email'));
  const redirectUri = readRedirectUri();

  // Drop the address from the visible URL once read, so it is not left in
  // browser history or copied into a shared link.
  useEffect(() => {
    if (!searchParams.has('email')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('email');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const { data } = await api.post('/api/auth/user/exchange-signup-token');
        if (!cancelled && data?.success) {
          leaveTo(redirectUri);
        }
      } catch {
        // Not verified yet, or no signup token present. Keep waiting quietly.
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [redirectUri]);

  return (
    <AuthLayout
      title="Confirm your email"
      subtitle={
        email
          ? 'We sent a verification link to the address below.'
          : 'We sent a verification link to your email address.'
      }
    >
      <div className="flex flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <IconMail size={26} />
        </span>

        {email && (
          <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-sm font-medium break-all text-ink">
            {email}
          </p>
        )}

        <p className="mt-4 text-sm text-ink-muted text-pretty">
          Open the link to activate your account. You can leave this page open — it will continue
          automatically once you are verified.
        </p>

        <p className="mt-5 inline-flex items-center gap-2 text-xs text-ink-faint">
          <Spinner size={14} label="Waiting for verification" />
          Waiting for confirmation…
        </p>

        <Button
          as={Link}
          to={withRedirectUri('/login', redirectUri)}
          variant="secondary"
          fullWidth
          className="mt-6"
        >
          Back to sign in
        </Button>
      </div>
    </AuthLayout>
  );
}
