import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { CopyField } from '@/components/ui/CopyField';
import { TextInput } from '@/components/ui/Field';
import { IconApps } from '@/components/ui/Icons';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

export function AdminAppsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(Number.parseInt(searchParams.get('page'), 10) || 1, 1);

  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirmName, setConfirmName] = useState('');
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setResult(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      const search = searchParams.get('query');
      if (search) params.set('query', search);

      const { data } = await api.get(`/api/admin/apps?${params}`);
      setResult(data);
      setError(null);
    } catch (requestError) {
      setError(requestError.message || 'Could not load applications.');
      setResult({ apps: [], total: 0, totalPages: 1, page: 1 });
    }
  }, [page, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if ((next.get('query') || '') === query.trim()) return;
      if (query.trim()) next.set('query', query.trim());
      else next.delete('query');
      next.delete('page');
      setSearchParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, searchParams, setSearchParams]);

  const remove = async () => {
    setPending(true);
    try {
      await api.del(`/api/admin/apps/${encodeURIComponent(deleting.oauthClientAppId)}`, {
        confirmName,
      });
      toast.success(`${deleting.oauthAppName} was deleted.`);
      setDeleting(null);
      await load();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not delete the application.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title={
            <>
              All applications
              {result && <Badge tone="neutral">{result.total}</Badge>}
            </>
          }
          description="Every OIDC client registered on this instance, across all owners."
          actions={
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Name, client ID or URI"
              label="Search applications"
              className="w-full sm:w-72"
            />
          }
        />
        <CardBody>
          {result === null ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-44 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Something went wrong" description={error} />
          ) : result.apps.length === 0 ? (
            <EmptyState
              icon={<IconApps size={22} />}
              title="No applications found"
              description="Nothing matches your search."
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {result.apps.map((app) => (
                <article
                  key={app.oauthClientAppId}
                  className="flex flex-col rounded-xl border border-hairline bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{app.oauthAppName}</h3>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {app.owner ? (
                          <>
                            Owner{' '}
                            <Link
                              to={`/admin/users/${encodeURIComponent(app.owner.userId)}`}
                              className="text-accent hover:text-accent-hover"
                            >
                              {app.owner.email || app.owner.userId}
                            </Link>
                          </>
                        ) : (
                          'No owner recorded'
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outlineDanger"
                      size="sm"
                      onClick={() => {
                        setConfirmName('');
                        setDeleting(app);
                      }}
                    >
                      Delete
                    </Button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge tone={app.isPublicClient ? 'cyan' : 'accent'}>
                      {app.isPublicClient ? 'Public client' : 'Confidential'}
                    </Badge>
                    <Badge tone="neutral">{app.accessTokenValidity}s token</Badge>
                    <Badge tone="neutral">{app.consentCount} users</Badge>
                    <Badge tone="neutral">{app.roleCount} roles</Badge>
                    {app.owner?.banned && <Badge tone="danger">Owner suspended</Badge>}
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <CopyField label="Client ID" value={app.clientId} />
                    <CopyField label="Redirect URI" value={app.redirectUri} />
                  </div>

                  <p className="mt-3 text-xs text-ink-faint">
                    Registered {formatDate(app.createdAt)}
                  </p>
                </article>
              ))}
            </div>
          )}

          {result && result.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('page', String(page - 1));
                  setSearchParams(next, { replace: true });
                }}
              >
                Previous
              </Button>
              <span className="text-xs text-ink-muted">
                Page {result.page} of {result.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= result.totalPages}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('page', String(page + 1));
                  setSearchParams(next, { replace: true });
                }}
              >
                Next
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this application"
        description="Its roles and every user's consent for it are removed too. Any live integration will break immediately."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              disabled={confirmName !== deleting?.oauthAppName}
              fullWidth
              className="sm:w-auto"
              onClick={remove}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <TextInput
          label={`Type "${deleting?.oauthAppName ?? ''}" to confirm`}
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          autoCapitalize="off"
          autoComplete="off"
        />
      </Modal>
    </>
  );
}
