import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconShield } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { initial } from '@/lib/format';
import { useSession } from '@/session/SessionProvider';

/** Human wording for the scopes the authorize endpoint accepts. */
const SCOPES = {
  openid: { name: 'Verify your identity', detail: 'Confirm who you are using ONEIDP' },
  profile: { name: 'Basic profile', detail: 'Your first name, last name and username' },
  email: { name: 'Email address', detail: 'Your registered email address' },
  offline_access: {
    name: 'Stay signed in',
    detail: 'Keep access while you are not using the app',
  },
};

/** OAuth params that must be forwarded verbatim to /api/oauth/authorize. */
const PASSTHROUGH = ['state', 'nonce', 'code_challenge', 'code_challenge_method'];

export function ConsentPage() {
  const toast = useToast();
  const { user } = useSession();
  const [searchParams] = useSearchParams();

  const params = useMemo(
    () => ({
      client_id: searchParams.get('client_id'),
      redirect_uri: searchParams.get('redirect_uri'),
      scope: searchParams.get('scope') || 'openid',
      state: searchParams.get('state'),
      nonce: searchParams.get('nonce'),
      code_challenge: searchParams.get('code_challenge'),
      code_challenge_method: searchParams.get('code_challenge_method'),
    }),
    [searchParams],
  );

  const [app, setApp] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [pending, setPending] = useState(false);

  const scopes = useMemo(
    () => params.scope.split(' ').filter((scope) => scope in SCOPES),
    [params.scope],
  );

  useEffect(() => {
    if (!params.client_id) {
      setLoadError('This authorization request is missing a client_id.');
      return;
    }

    let active = true;
    api
      .get(`/api/oauth/consent/app-info?client_id=${encodeURIComponent(params.client_id)}`)
      .then(({ data }) => {
        if (active) setApp(data);
      })
      .catch(() => {
        if (active) setLoadError('That application could not be found.');
      });

    return () => {
      active = false;
    };
  }, [params.client_id]);

  const approve = async () => {
    setPending(true);
    try {
      await api.post('/api/oauth/consent', {
        client_id: params.client_id,
        scope: params.scope,
        action: 'approve',
      });

      // Hand control back to the authorize endpoint, which now finds a stored
      // consent and issues the authorization code.
      const authorize = new URL('/api/oauth/authorize', window.location.origin);
      authorize.searchParams.set('client_id', params.client_id);
      authorize.searchParams.set('redirect_uri', params.redirect_uri ?? '');
      authorize.searchParams.set('scope', params.scope);
      for (const key of PASSTHROUGH) {
        if (params[key]) authorize.searchParams.set(key, params[key]);
      }
      window.location.assign(authorize.toString());
    } catch (error) {
      toast.error(error.message || 'Could not complete authorization.');
      setPending(false);
    }
  };

  const deny = () => {
    // Only bounce back to the URI actually registered for this client, so a
    // crafted redirect_uri cannot turn this screen into an open redirect.
    const registered = app?.redirectUri;
    if (!registered || registered !== params.redirect_uri) {
      window.location.assign('/dashboard');
      return;
    }

    const target = new URL(registered);
    target.searchParams.set('error', 'access_denied');
    target.searchParams.set('error_description', 'User denied the authorization request');
    if (params.state) target.searchParams.set('state', params.state);
    window.location.assign(target.toString());
  };

  if (loadError) {
    return (
      <AuthLayout title="Authorization failed" width="sm">
        <div className="text-center">
          <p className="text-sm text-ink-muted">{loadError}</p>
          <Button as="a" href="/dashboard" variant="secondary" fullWidth className="mt-6">
            Go to dashboard
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={app ? `Authorize ${app.appName}` : 'Authorize application'}
      subtitle="Review what this application will be able to access."
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4 rounded-xl border border-hairline bg-surface p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-cyan text-lg font-semibold text-white">
            {app ? initial(app.appName) : <IconShield size={22} />}
          </span>
          <div className="min-w-0">
            {app ? (
              <>
                <p className="truncate font-medium text-ink">{app.appName}</p>
                <p className="truncate text-xs text-ink-faint">wants to access your account</p>
              </>
            ) : (
              <>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-44" />
              </>
            )}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-medium tracking-wide text-ink-faint uppercase">
            This will allow it to
          </p>
          <ul className="space-y-3">
            {scopes.map((scope) => (
              <li key={scope} className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-positive">
                  <IconCheck size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{SCOPES[scope].name}</span>
                  <span className="block text-xs text-ink-muted">{SCOPES[scope].detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {user?.email && (
          <p className="text-xs text-ink-faint">
            Signed in as <span className="text-ink-muted">{user.email}</span>
          </p>
        )}

        {/* Approve sits above Deny on mobile so the primary action is under the
            thumb, and to the right on desktop where users scan left to right. */}
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row">
          <Button variant="secondary" fullWidth size="lg" onClick={deny} disabled={pending}>
            Deny
          </Button>
          <Button fullWidth size="lg" onClick={approve} loading={pending} disabled={!app}>
            Authorize
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
