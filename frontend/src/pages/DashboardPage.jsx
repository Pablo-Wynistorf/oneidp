import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/layouts/AppLayout';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { CopyField } from '@/components/ui/CopyField';
import { IconKey, IconShield } from '@/components/ui/Icons';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  AuthorizedAppCard,
  AuthorizedAppSkeleton,
  useAuthorizedApps,
} from '@/features/authorized-apps';
import { toRoleList } from '@/lib/format';
import { useSession } from '@/session/SessionProvider';

const DASHBOARD_LIMIT = 6;

export function DashboardPage() {
  const { user } = useSession();
  const toast = useToast();
  const { apps, error, revoke } = useAuthorizedApps();
  const [target, setTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const roles = toRoleList(user?.providerRoles);
  const visible = apps?.slice(0, DASHBOARD_LIMIT) ?? [];
  const hasMore = (apps?.length ?? 0) > DASHBOARD_LIMIT;

  const confirmRevoke = async () => {
    setRevoking(true);
    try {
      await revoke(target.clientId);
      toast.success(`Access for ${target.appName} was revoked.`);
      setTarget(null);
    } catch (requestError) {
      toast.error(requestError.message || 'Could not revoke access.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.firstName || user?.username || 'there'}`}
        description="Your identity, connected applications and security status."
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        {/* Security summary — first on mobile because it is the most scannable. */}
        <Card className="lg:col-span-1">
          <CardHeader title="Security" />
          <CardBody className="space-y-4">
            <SecurityRow
              icon={<IconShield size={18} />}
              label="Two-factor authentication"
              active={Boolean(user?.mfaEnabled)}
            />
            <SecurityRow
              icon={<IconKey size={18} />}
              label="Passkey"
              active={Boolean(user?.passkeyEnabled)}
            />
            <Button as={Link} to="/settings" variant="secondary" fullWidth size="sm">
              Manage security
            </Button>
          </CardBody>
        </Card>

        {/* Profile */}
        <Card className="lg:col-span-2">
          <CardHeader title="Your profile" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <CopyField label="User ID" value={user?.userId ?? ''} />
            <CopyField label="Username" value={user?.username ?? ''} mono={false} />
            <CopyField label="First name" value={user?.firstName ?? ''} mono={false} />
            <CopyField label="Last name" value={user?.lastName ?? ''} mono={false} />
            <div className="sm:col-span-2">
              <CopyField label="Email" value={user?.email ?? ''} mono={false} />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">Roles</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {roles.length > 0 ? (
                  roles.map((role) => (
                    <Badge key={role} tone="warning">
                      {role}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-ink-muted">No roles assigned</span>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Authorized applications */}
        <Card className="lg:col-span-3">
          <CardHeader
            title={
              <>
                Authorized applications
                {apps && <Badge tone="neutral">{apps.length}</Badge>}
              </>
            }
            description="Applications you have granted access to your ONEIDP identity."
            actions={
              hasMore && (
                <Button as={Link} to="/oidc/apps/authorized" variant="secondary" size="sm">
                  View all
                </Button>
              )
            }
          />
          <CardBody>
            {apps === null ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <AuthorizedAppSkeleton key={index} />
                ))}
              </div>
            ) : error ? (
              <EmptyState title="Something went wrong" description={error} />
            ) : apps.length === 0 ? (
              <EmptyState
                icon={<IconShield size={22} />}
                title="No authorized applications yet"
                description="Applications appear here once you sign in to them with ONEIDP."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((app) => (
                  <AuthorizedAppCard key={app.clientId} app={app} onRevoke={setTarget} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={confirmRevoke}
        loading={revoking}
        destructive
        title="Revoke access?"
        description={`${target?.appName ?? 'This application'} will lose access to your account and will ask for your consent again next time.`}
        confirmLabel="Revoke access"
      />
    </>
  );
}

function SecurityRow({ icon, label, active }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-strong text-ink-muted">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{label}</p>
        <StatusDot active={active} className="text-ink-muted">
          {active ? 'Enabled' : 'Not enabled'}
        </StatusDot>
      </div>
    </div>
  );
}
