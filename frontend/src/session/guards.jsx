import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from './SessionProvider';
import { Spinner } from '@/components/ui/Spinner';
import { Brand } from '@/components/Brand';

/** Full-page placeholder shown while the initial session probe is in flight. */
function SessionSplash() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-5">
        <Brand size="lg" />
        <Spinner size={24} className="text-ink-faint" label="Checking your session" />
      </div>
    </div>
  );
}

/**
 * Gate for the signed-in area.
 *
 * Sends anonymous visitors to /login with a `redirectUri` back to wherever they
 * were headed, mirroring the old Express `verifyToken` middleware.
 */
export function RequireAuth() {
  const { isLoading, isAuthenticated } = useSession();
  const location = useLocation();

  if (isLoading) return <SessionSplash />;

  if (!isAuthenticated) {
    const target = `${location.pathname}${location.search}`;
    const suffix = target && target !== '/dashboard' ? `?redirectUri=${target}` : '';
    return <Navigate to={`/login${suffix}`} replace />;
  }

  return <Outlet />;
}

/**
 * Gate for pages that only make sense when signed out (login, signup, …).
 * Replaces the old `existingToken` middleware, which bounced authenticated
 * users straight to the dashboard.
 */
export function RequireAnonymous() {
  const { isLoading, isAuthenticated } = useSession();

  if (isLoading) return <SessionSplash />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}

/**
 * Gate for the admin console.
 *
 * This only decides what to render. Authorisation lives in the `requireAdmin`
 * middleware on /api/admin, which checks the email allow-list on every request —
 * a user who forced their way to /admin would simply see empty, failing views.
 *
 * Non-admins get a 404 rather than a redirect, so the console does not announce
 * its existence to ordinary users.
 */
export function RequireAdmin() {
  const { isLoading, isAuthenticated, user } = useSession();

  if (isLoading) return <SessionSplash />;
  if (!isAuthenticated) return <Navigate to="/login?redirectUri=/admin" replace />;
  if (!user?.isAdmin) return <Navigate to="/not-found" replace />;

  return <Outlet />;
}

/**
 * Gate for the self-service OIDC application and role pages.
 *
 * Most accounts cannot manage applications, so these routes are hidden from
 * them entirely and they are sent back to the dashboard.
 *
 * The session is probed once on boot, so an admin granting the capability to a
 * signed-in user would otherwise only take effect after a manual reload. Before
 * turning anyone away, re-check with the server once.
 */
export function RequireAppManagement() {
  const { isLoading, isAuthenticated, user, refresh } = useSession();
  const [revalidated, setRevalidated] = useState(false);

  const needsRecheck = isAuthenticated && !user?.canManageApps && !revalidated;

  useEffect(() => {
    if (!needsRecheck) return;

    let active = true;
    refresh().finally(() => {
      if (active) setRevalidated(true);
    });

    return () => {
      active = false;
    };
  }, [needsRecheck, refresh]);

  if (isLoading) return <SessionSplash />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsRecheck) return <SessionSplash />;
  if (!user?.canManageApps) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
