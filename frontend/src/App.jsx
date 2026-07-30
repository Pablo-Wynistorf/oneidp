import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  RequireAdmin,
  RequireAnonymous,
  RequireAppManagement,
  RequireAuth,
} from '@/session/guards';
import { Spinner } from '@/components/ui/Spinner';

// The unauthenticated flows are the common entry point, so they ship in the
// main bundle. The signed-in area and the static legal pages are split out to
// keep the first load small on mobile connections.
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { VerifyPage } from '@/pages/VerifyPage';
import { MfaPage } from '@/pages/MfaPage';
import { RecoveryPage } from '@/pages/RecoveryPage';
import { SetPasswordPage } from '@/pages/SetPasswordPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
// The docs carry the markdown for every guide plus the renderer, so they stay
// in their own chunk and are only fetched when someone opens /docs.
const DocsPage = lazy(() => import('@/pages/DocsPage').then((m) => ({ default: m.DocsPage })));
const ConsentPage = lazy(() =>
  import('@/pages/ConsentPage').then((m) => ({ default: m.ConsentPage })),
);
const AppLayout = lazy(() => import('@/layouts/AppLayout').then((m) => ({ default: m.AppLayout })));
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const OidcAppsPage = lazy(() =>
  import('@/pages/OidcAppsPage').then((m) => ({ default: m.OidcAppsPage })),
);
const OidcRolesPage = lazy(() =>
  import('@/pages/OidcRolesPage').then((m) => ({ default: m.OidcRolesPage })),
);
const AuthorizedAppsPage = lazy(() =>
  import('@/pages/AuthorizedAppsPage').then((m) => ({ default: m.AuthorizedAppsPage })),
);
const ImprintPage = lazy(() => import('@/pages/LegalPage').then((m) => ({ default: m.ImprintPage })));
const PrivacyPolicyPage = lazy(() =>
  import('@/pages/LegalPage').then((m) => ({ default: m.PrivacyPolicyPage })),
);

// The admin console is a separate chunk: only a handful of accounts ever load it.
const AdminLayout = lazy(() =>
  import('@/pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const AdminOverviewPage = lazy(() =>
  import('@/pages/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })),
);
const AdminUsersPage = lazy(() =>
  import('@/pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
);
const AdminUserDetailPage = lazy(() =>
  import('@/pages/admin/AdminUserDetailPage').then((m) => ({ default: m.AdminUserDetailPage })),
);
const AdminAppsPage = lazy(() =>
  import('@/pages/admin/AdminAppsPage').then((m) => ({ default: m.AdminAppsPage })),
);
const AdminInvitationsPage = lazy(() =>
  import('@/pages/admin/AdminInvitationsPage').then((m) => ({ default: m.AdminInvitationsPage })),
);
const AdminSettingsPage = lazy(() =>
  import('@/pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })),
);

function RouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner size={24} className="text-ink-faint" label="Loading page" />
    </div>
  );
}

/**
 * Sends `/dashboard/` to `/dashboard`.
 *
 * The router treats both spellings as the same route, so a trailing slash would
 * otherwise stay in the address bar and split bookmarks, analytics and OAuth
 * redirect URIs across two URLs for every page. Handling it here rather than at
 * the edge keeps the query string and hash intact, which the OAuth flow relies
 * on. CloudFront serves index.html for either form.
 */
function CanonicalPath({ children }) {
  const { pathname, search, hash } = useLocation();

  if (pathname.length > 1 && pathname.endsWith('/')) {
    return <Navigate to={pathname.replace(/\/+$/, '') + search + hash} replace />;
  }

  return children;
}

/**
 * Route table.
 *
 * Paths match the previous multi-page app exactly, because the API redirects to
 * them (`/login`, `/consent`, `/dashboard`, `/setpassword`, `/verify`) and
 * existing bookmarks and OAuth flows depend on them.
 */
export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <CanonicalPath>
        <Routes>
          {/* Public */}
          <Route path="/" element={<HomePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:slug" element={<DocsPage />} />
          <Route path="/imprint" element={<ImprintPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

          {/* Reachable with or without a session: both rely on a short-lived
              cookie the API set from an emailed link or a partial login. */}
          <Route path="/setpassword" element={<SetPasswordPage />} />
          <Route path="/mfa" element={<MfaPage />} />

          {/* Signed out only */}
          <Route element={<RequireAnonymous />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/recovery" element={<RecoveryPage />} />
            <Route path="/verify" element={<VerifyPage />} />
          </Route>

          {/* Signed in only */}
          <Route element={<RequireAuth />}>
            {/* Consent keeps the bare AuthLayout: it is a decision point in the
                OAuth flow, not a place to wander off into the app nav. */}
            <Route path="/consent" element={<ConsentPage />} />

            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/oidc/apps/authorized" element={<AuthorizedAppsPage />} />

              {/* Managing OIDC clients is a capability, not something every
                  account gets. Enforced again by requireAppManagement server-side. */}
              <Route element={<RequireAppManagement />}>
                <Route path="/oidc/apps" element={<OidcAppsPage />} />
                <Route path="/oidc/roles" element={<OidcRolesPage />} />
              </Route>

              {/* Admin console */}
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverviewPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="invitations" element={<AdminInvitationsPage />} />
                  <Route path="apps" element={<AdminAppsPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                </Route>
                <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="/oidc" element={<Navigate to="/oidc/apps" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </CanonicalPath>
    </Suspense>
  );
}
