import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { DocsLink } from '@/components/DocsLink';
import { Button, IconButton } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  IconApps,
  IconBook,
  IconClose,
  IconExternal,
  IconGrid,
  IconLogout,
  IconMenu,
  IconRoles,
  IconSettings,
  IconShield,
  IconShieldAlert,
} from '@/components/ui/Icons';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { gravatarUrl, initial } from '@/lib/format';
import { useSession } from '@/session/SessionProvider';

/**
 * Primary navigation. One list drives the desktop sidebar and the mobile
 * drawer, so both surfaces always offer the same destinations.
 */
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: IconGrid },
  { to: '/oidc/apps/authorized', label: 'Authorized', icon: IconShield },
  // Shown only to accounts holding the canManageApps capability.
  { to: '/oidc/apps', label: 'OIDC apps', icon: IconApps, requires: 'canManageApps' },
  { to: '/oidc/roles', label: 'Roles', icon: IconRoles, requires: 'canManageApps' },
  { to: '/settings', label: 'Settings', icon: IconSettings },
  { to: '/admin', label: 'Admin', icon: IconShieldAlert, requires: 'isAdmin' },
  // Public integration docs: belongs in the nav so it is reachable without
  // going back to the marketing site, but opens in a new tab so reading it
  // never costs you the page you were working on.
  { to: '/docs', label: 'Docs', icon: IconBook, newTab: true },
];

const NAV_ITEM_CLASS = [
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium tap-target',
  'transition-colors duration-150',
].join(' ');

const NAV_ITEM_IDLE_CLASS = 'text-ink-muted hover:bg-surface hover:text-ink';

/**
 * Filter the navigation to what this account can actually reach.
 * Hiding a link is presentation only; the routes and the API enforce access.
 */
function visibleNavItems(user) {
  return NAV_ITEMS.filter((item) => {
    if (item.requires === 'canManageApps') return Boolean(user?.canManageApps);
    if (item.requires === 'isAdmin') return Boolean(user?.isAdmin);
    return true;
  });
}

/** Shared logout: clear the server session, drop local state, land on /login. */
function useLogout() {
  const toast = useToast();
  const { clear } = useSession();
  const [pending, setPending] = useState(false);

  const logout = async () => {
    setPending(true);
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Even if the call fails the local session is unusable; fall through.
    } finally {
      clear();
      window.location.assign('/login');
    }
  };

  return { logout, pending, toast };
}

function NavItem({ item, onNavigate }) {
  const Icon = item.icon;

  // A new-tab destination never becomes the current route, so it is a plain
  // link rather than a NavLink and carries an external-link hint instead.
  if (item.newTab) {
    return (
      <DocsLink
        to={item.to}
        onClick={onNavigate}
        className={cn(NAV_ITEM_CLASS, NAV_ITEM_IDLE_CLASS)}
      >
        <Icon size={19} />
        <span className="truncate">{item.label}</span>
        <IconExternal size={14} aria-hidden className="ml-auto shrink-0 text-ink-faint" />
        <span className="sr-only">(opens in a new tab)</span>
      </DocsLink>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === '/oidc/apps'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          NAV_ITEM_CLASS,
          isActive
            ? 'bg-accent/15 text-ink shadow-[inset_0_0_0_1px_var(--color-accent-soft)]'
            : NAV_ITEM_IDLE_CLASS,
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={19} className={isActive ? 'text-accent' : undefined} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function UserChip({ user, avatar, className }) {
  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-cyan text-sm font-semibold text-white">
        {avatar ? (
          <img src={avatar} alt="" width={36} height={36} className="size-full object-cover" />
        ) : (
          initial(user?.firstName || user?.username)
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">
          {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || '—'}
        </span>
        <span className="block truncate text-xs text-ink-faint">{user?.email}</span>
      </span>
    </div>
  );
}

/**
 * Shell for the signed-in area.
 *
 * Desktop gets a persistent sidebar. Mobile gets a compact top bar plus a
 * slide-in drawer, and that drawer is the *only* mobile nav: a bottom tab bar
 * on top of it duplicated the same links, could not hold the role-dependent
 * items (admins see seven) or sign-out, and sat directly under the browser's
 * own toolbar. Safe-area insets are respected on both.
 */
export function AppLayout() {
  const { user } = useSession();
  const { logout, pending } = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    if (!user?.email) {
      setAvatar(null);
      return undefined;
    }
    gravatarUrl(user.email).then((url) => {
      if (active) setAvatar(url);
    });
    return () => {
      active = false;
    };
  }, [user?.email]);

  // Close the drawer on navigation and lock the body while it is open.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => event.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  const navItems = visibleNavItems(user);

  const sidebarBody = (onNavigate) => (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
        {navItems.map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="border-t border-hairline p-3">
        <UserChip user={user} avatar={avatar} className="px-1 pb-3" />
        <Button
          variant="secondary"
          fullWidth
          onClick={logout}
          loading={pending}
          className="justify-start"
        >
          <IconLogout size={18} />
          Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-hairline bg-canvas-raised/50 backdrop-blur-xl md:flex">
        <div className="px-5 py-5">
          <Link to="/dashboard" aria-label="ONEIDP dashboard" className="rounded-lg">
            <Brand />
          </Link>
        </div>
        {sidebarBody()}
      </aside>

      {/* Mobile top bar — the single entry point to the mobile nav */}
      <header className="sticky top-0 z-40 flex w-full items-center justify-between gap-3 border-b border-hairline bg-canvas/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
        <div className="flex h-14 min-w-0 items-center">
          <Link to="/dashboard" aria-label="ONEIDP dashboard" className="rounded-lg">
            <Brand size="sm" />
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-controls="mobile-drawer"
          className="flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface py-1.5 pr-3 pl-1.5 text-ink-muted tap-target transition-colors hover:bg-surface-strong hover:text-ink"
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-cyan text-xs font-semibold text-white">
            {avatar ? (
              <img src={avatar} alt="" width={32} height={32} className="size-full object-cover" />
            ) : (
              initial(user?.firstName || user?.username)
            )}
          </span>
          <IconMenu size={20} />
          <span className="sr-only">Open menu</span>
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm [animation:oneidp-fade-in_0.18s_ease-out]"
          />
          <div
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 right-0 flex w-[min(19rem,85vw)] flex-col border-l border-hairline bg-canvas-raised pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl [animation:oneidp-drawer-in_0.22s_ease-out]"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <Brand size="sm" />
              <IconButton label="Close menu" onClick={() => setDrawerOpen(false)}>
                <IconClose />
              </IconButton>
            </div>
            {sidebarBody(() => setDrawerOpen(false))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <main
          id="main"
          className="mx-auto w-full max-w-6xl px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] sm:px-6 sm:py-7 md:pb-10"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Page heading used inside AppLayout. */
export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted text-pretty">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
