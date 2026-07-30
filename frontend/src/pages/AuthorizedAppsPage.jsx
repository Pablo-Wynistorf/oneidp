import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/layouts/AppLayout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { IconBack, IconShield } from '@/components/ui/Icons';
import { ConfirmDialog } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import {
  AuthorizedAppCard,
  AuthorizedAppSkeleton,
  useAuthorizedApps,
} from '@/features/authorized-apps';

export function AuthorizedAppsPage() {
  const toast = useToast();
  const { apps, error, revoke } = useAuthorizedApps();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);

  // Deferred so typing stays responsive when the list is long. Replaces the
  // manual 200ms debounce the old page used.
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    if (!apps) return null;
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter(
      (app) =>
        app.appName?.toLowerCase().includes(needle) ||
        app.clientId?.toLowerCase().includes(needle),
    );
  }, [apps, deferredQuery]);

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
        title="Authorized applications"
        description="Every application that can access your ONEIDP identity."
        actions={
          <Button as={Link} to="/dashboard" variant="ghost" size="sm">
            <IconBack size={16} />
            Overview
          </Button>
        }
      />

      <Card>
        <CardHeader
          title={
            <>
              Connected apps
              {apps && <Badge tone="neutral">{apps.length}</Badge>}
            </>
          }
          actions={
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by name or client ID"
              label="Search authorized applications"
              className="w-full sm:w-72"
            />
          }
        />
        <CardBody>
          {filtered === null ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <AuthorizedAppSkeleton key={index} />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Something went wrong" description={error} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<IconShield size={22} />}
              title={query ? 'No matching applications' : 'No authorized applications yet'}
              description={
                query
                  ? 'Try a different name or client ID.'
                  : 'Applications appear here once you sign in to them with ONEIDP.'
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((app) => (
                <AuthorizedAppCard key={app.clientId} app={app} onRevoke={setTarget} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

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
