import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/layouts/AppLayout';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { CopyField } from '@/components/ui/CopyField';
import { Switch, TextInput } from '@/components/ui/Field';
import { IconApps, IconEdit, IconPlus, IconRoles, IconTrash } from '@/components/ui/Icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api, SessionExpiredError } from '@/lib/api';

const EMPTY_APP = {
  oauthAppName: '',
  redirectUri: '',
  accessTokenValidity: '3600',
  isPublicClient: false,
};

export function OidcAppsPage() {
  const toast = useToast();
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletePending, setDeletePending] = useState(false);

  const deferredQuery = useDeferredValue(query);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/oauth/settings/apps/get');
      setApps(data?.oauthApps ?? []);
      setError(null);
    } catch (requestError) {
      if (requestError instanceof SessionExpiredError) return;
      setApps([]);
      setError('Could not load your OIDC applications.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!apps) return null;
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter((app) =>
      [app.oauthAppName, app.clientId, app.redirectUri].some((field) =>
        field?.toLowerCase().includes(needle),
      ),
    );
  }, [apps, deferredQuery]);

  const confirmDelete = async () => {
    setDeletePending(true);
    try {
      await api.post('/api/oauth/settings/apps/delete', {
        oauthClientAppId: deleting.oauthClientAppId,
      });
      toast.success(`${deleting.oauthAppName} was deleted.`);
      setDeleting(null);
      await load();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not delete the application.');
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="OIDC applications"
        description="Register the applications that authenticate against ONEIDP."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus size={17} />
            New application
          </Button>
        }
      />

      <div className="space-y-4 lg:space-y-5">
        <EndpointsCard />

        <Card>
          <CardHeader
            title={
              <>
                Applications
                {apps && <Badge tone="neutral">{apps.length}</Badge>}
              </>
            }
            actions={
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search name, client ID or URI"
                label="Search applications"
                className="w-full sm:w-72"
              />
            }
          />
          <CardBody>
            {filtered === null ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-52 w-full rounded-xl" />
                ))}
              </div>
            ) : error ? (
              <EmptyState title="Something went wrong" description={error} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<IconApps size={22} />}
                title={query ? 'No matching applications' : 'No applications yet'}
                description={
                  query
                    ? 'Try a different search term.'
                    : 'Register your first application to start issuing tokens.'
                }
                action={
                  !query && (
                    <Button onClick={() => setCreateOpen(true)}>
                      <IconPlus size={17} />
                      New application
                    </Button>
                  )
                }
              />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {filtered.map((app) => (
                  <AppCard
                    key={app.oauthClientAppId}
                    app={app}
                    onEdit={() => setEditing(app)}
                    onDelete={() => setDeleting(app)}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <AppFormModal
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSaved={load}
      />
      <AppFormModal
        open={Boolean(editing)}
        mode="edit"
        app={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deletePending}
        destructive
        title="Delete this application?"
        description={`${deleting?.oauthAppName ?? 'This application'} will stop being able to authenticate users. This cannot be undone.`}
        confirmLabel="Delete application"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** Discovery + token endpoints, derived from the current origin. */
function EndpointsCard() {
  const origin = window.location.origin;
  const endpoints = [
    { label: 'Issuer', value: origin },
    { label: 'Discovery', value: `${origin}/.well-known/openid-configuration` },
    { label: 'Authorization', value: `${origin}/api/oauth/authorize` },
    { label: 'Token', value: `${origin}/api/oauth/token` },
    { label: 'Token introspection', value: `${origin}/api/oauth/check_token` },
    { label: 'User info', value: `${origin}/api/oauth/userinfo` },
    { label: 'JWKS', value: `${origin}/.well-known/jwks.json` },
  ];

  return (
    <Card>
      <CardHeader
        title="Integration endpoints"
        description="Point your OpenID Connect client at these URLs. Refresh tokens are valid for 20 days."
      />
      <CardBody className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {endpoints.map((endpoint) => (
          <CopyField key={endpoint.label} label={endpoint.label} value={endpoint.value} />
        ))}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function AppCard({ app, onEdit, onDelete }) {
  return (
    <article className="flex flex-col rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-ink" title={app.oauthAppName}>
            {app.oauthAppName}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={app.isPublicClient ? 'cyan' : 'accent'}>
              {app.isPublicClient ? 'Public client' : 'Confidential'}
            </Badge>
            <Badge tone="neutral">{app.accessTokenValidity}s token</Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton label={`Edit ${app.oauthAppName}`} onClick={onEdit}>
            <IconEdit size={17} />
          </IconButton>
          <IconButton
            as={Link}
            to={`/oidc/roles?oauthAppId=${encodeURIComponent(app.oauthClientAppId)}`}
            label={`Manage roles for ${app.oauthAppName}`}
          >
            <IconRoles size={17} />
          </IconButton>
          <IconButton
            label={`Delete ${app.oauthAppName}`}
            onClick={onDelete}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <IconTrash size={17} />
          </IconButton>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <CopyField label="Client ID" value={app.clientId} />
        {!app.isPublicClient && (
          <CopyField label="Client secret" value={app.clientSecret} secret />
        )}
        <CopyField label="Redirect URI" value={app.redirectUri} />
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Create/edit form.
 *
 * `isPublicClient` is deliberately create-only: the edit endpoint does not
 * accept it, and flipping a confidential client to public would silently
 * invalidate its secret.
 */
function AppFormModal({ open, mode, app, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_APP);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      mode === 'edit' && app
        ? {
            oauthAppName: app.oauthAppName ?? '',
            redirectUri: app.redirectUri ?? '',
            accessTokenValidity: String(app.accessTokenValidity ?? ''),
            isPublicClient: Boolean(app.isPublicClient),
          }
        : EMPTY_APP,
    );
  }, [open, mode, app]);

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const canSubmit =
    form.oauthAppName.trim() !== '' &&
    form.redirectUri.trim() !== '' &&
    form.accessTokenValidity.trim() !== '';

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || pending) return;

    setPending(true);
    try {
      if (mode === 'create') {
        await api.post('/api/oauth/settings/apps/add', {
          oauthAppName: form.oauthAppName,
          redirectUri: form.redirectUri,
          accessTokenValidity: form.accessTokenValidity,
          isPublicClient: form.isPublicClient,
        });
        toast.success('Application created.');
      } else {
        await api.post('/api/oauth/settings/apps/edit', {
          oauthClientAppId: app.oauthClientAppId,
          oauthAppName: form.oauthAppName,
          redirectUri: form.redirectUri,
          accessTokenValidity: form.accessTokenValidity,
        });
        toast.success('Changes saved.');
      }
      await onSaved();
      onClose();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not save the application.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'New OIDC application' : 'Edit application'}
      description={
        mode === 'create'
          ? 'Register a client that will authenticate users through ONEIDP.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button
            form="app-form"
            type="submit"
            loading={pending}
            disabled={!canSubmit}
            fullWidth
            className="sm:w-auto"
          >
            {mode === 'create' ? 'Create application' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="app-form" onSubmit={submit} className="space-y-4" noValidate>
        {mode === 'edit' && (
          <TextInput label="Application ID" value={app?.oauthClientAppId ?? ''} readOnly disabled />
        )}
        <TextInput
          label="Application name"
          value={form.oauthAppName}
          onChange={update('oauthAppName')}
          required
        />
        <TextInput
          label="Redirect URI"
          type="url"
          inputMode="url"
          placeholder="https://app.example.com/callback"
          value={form.redirectUri}
          onChange={update('redirectUri')}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <TextInput
          label="Access token validity"
          type="number"
          inputMode="numeric"
          min="60"
          step="1"
          hint="In seconds."
          value={form.accessTokenValidity}
          onChange={update('accessTokenValidity')}
          required
        />
        {mode === 'create' && (
          <div className="rounded-xl border border-hairline bg-surface p-3.5">
            <Switch
              label="Public client"
              description="For SPAs and mobile apps that cannot keep a secret. Uses PKCE and is issued no client secret."
              checked={form.isPublicClient}
              onChange={(value) => setForm((current) => ({ ...current, isPublicClient: value }))}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
