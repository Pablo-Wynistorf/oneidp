import { NavLink, Outlet } from 'react-router-dom';
import { PageHeader } from '@/layouts/AppLayout';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { useSession } from '@/session/SessionProvider';

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/invitations', label: 'Invitations' },
  { to: '/admin/apps', label: 'Applications' },
  { to: '/admin/settings', label: 'Settings' },
];

/**
 * Shell for the admin console.
 *
 * Sub-navigation is a horizontally scrollable tab strip so it stays usable on a
 * phone without collapsing into yet another menu.
 */
export function AdminLayout() {
  const { user } = useSession();

  return (
    <>
      <PageHeader
        title="Admin console"
        description="Manage users, applications and instance-wide settings."
        actions={<Badge tone="danger">Signed in as {user?.email}</Badge>}
      />

      <nav
        aria-label="Admin sections"
        className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <div className="inline-flex min-w-full gap-1 rounded-xl border border-hairline bg-canvas-raised/60 p-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex-1 rounded-lg px-3.5 py-2 text-center text-sm font-medium whitespace-nowrap tap-target',
                  'transition-colors duration-150',
                  isActive ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet />
    </>
  );
}
