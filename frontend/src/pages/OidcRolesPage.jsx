import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/layouts/AppLayout';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyField';
import { SegmentedControl, TextArea, TextInput } from '@/components/ui/Field';
import { IconChevronDown, IconClose, IconPlus, IconRoles, IconTrash, IconUser } from '@/components/ui/Icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton, Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api, SessionExpiredError } from '@/lib/api';
import { cn } from '@/lib/cn';

export function OidcRolesPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAppId = searchParams.get('oauthAppId');

  const [apps, setApps] = useState(null);
  const [roles, setRoles] = useState(null);
  const [rolesError, setRolesError] = useState(null);
  const [roleQuery, setRoleQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletePending, setDeletePending] = useState(false);

  const deferredRoleQuery = useDeferredValue(roleQuery);
  const selectedApp = apps?.find((app) => String(app.oauthClientAppId) === String(selectedAppId));

  useEffect(() => {
    let active = true;
    api
      .get('/api/oauth/settings/apps/get')
      .then(({ data }) => {
        if (active) setApps(data?.oauthApps ?? []);
      })
      .catch((error) => {
        // The session guard is already redirecting; no error state needed.
        if (error instanceof SessionExpiredError) return;
        if (active) {
          setApps([]);
          toast.error('Could not load your OIDC applications.');
        }
      });
    return () => {
      active = false;
    };
  }, [toast]);

  const loadRoles = useCallback(async () => {
    if (!selectedAppId) {
      setRoles(null);
      return;
    }
    try {
      const { data } = await api.post('/api/oauth/settings/roles/get', {
        oauthClientAppId: selectedAppId,
      });
      setRoles(data?.oauthRoles ?? []);
      setRolesError(null);
    } catch (error) {
      if (error instanceof SessionExpiredError) return;
      setRoles([]);
      setRolesError('Could not load roles for this application.');
    }
  }, [selectedAppId]);

  useEffect(() => {
    setRoles(null);
    setRoleQuery('');
    loadRoles();
  }, [loadRoles]);

  const selectApp = (app) => {
    const next = new URLSearchParams(searchParams);
    if (app) next.set('oauthAppId', app.oauthClientAppId);
    else next.delete('oauthAppId');
    setSearchParams(next, { replace: true });
  };

  const filteredRoles = useMemo(() => {
    if (!roles) return null;
    const needle = deferredRoleQuery.trim().toLowerCase();
    if (!needle) return roles;
    return roles.filter(
      (role) =>
        role.oauthRoleName?.toLowerCase().includes(needle) ||
        role.oauthRoleId?.toLowerCase().includes(needle),
    );
  }, [roles, deferredRoleQuery]);

  const confirmDelete = async () => {
    setDeletePending(true);
    try {
      await api.post('/api/oauth/settings/roles/delete', {
        oauthClientAppId: selectedAppId,
        oauthRoleId: deleting.oauthRoleId,
      });
      toast.success(`Role ${deleting.oauthRoleName} was deleted.`);
      setDeleting(null);
      await loadRoles();
    } catch (error) {
      toast.error(error.message || 'Could not delete the role.');
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Roles"
        description="Assign users to application-specific roles that are embedded in their tokens."
      />

      <div className="space-y-4 lg:space-y-5">
        <Card>
          <CardHeader
            title="Application"
            description="Choose which application's roles you want to manage."
          />
          <CardBody>
            <AppCombobox apps={apps} selected={selectedApp} onSelect={selectApp} />
          </CardBody>
        </Card>

        {selectedAppId && (
          <Card>
            <CardHeader
              title={
                <>
                  Roles
                  {roles && <Badge tone="neutral">{roles.length}</Badge>}
                </>
              }
              actions={
                <>
                  <SearchInput
                    value={roleQuery}
                    onChange={setRoleQuery}
                    placeholder="Search roles"
                    label="Search roles"
                    className="w-full sm:w-56"
                  />
                  <Button onClick={() => setCreateOpen(true)} size="sm">
                    <IconPlus size={16} />
                    New role
                  </Button>
                </>
              }
            />
            <CardBody>
              {filteredRoles === null ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : rolesError ? (
                <EmptyState title="Something went wrong" description={rolesError} />
              ) : filteredRoles.length === 0 ? (
                <EmptyState
                  icon={<IconRoles size={22} />}
                  title={roleQuery ? 'No matching roles' : 'No roles yet'}
                  description={
                    roleQuery
                      ? 'Try a different search term.'
                      : 'Create a role to start grouping users for this application.'
                  }
                  action={
                    !roleQuery && (
                      <Button onClick={() => setCreateOpen(true)}>
                        <IconPlus size={17} />
                        New role
                      </Button>
                    )
                  }
                />
              ) : (
                <ul className="space-y-2.5">
                  {filteredRoles.map((role) => (
                    <li
                      key={role.oauthRoleId}
                      className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-strong text-ink-muted">
                          <IconRoles size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {role.oauthRoleName}
                          </p>
                          <span className="flex items-center gap-1">
                            <code
                              className="truncate font-mono text-[0.7rem] text-ink-faint"
                              title={role.oauthRoleId}
                            >
                              {role.oauthRoleId}
                            </code>
                            <CopyButton
                              value={role.oauthRoleId}
                              label="Copy role ID"
                              className="size-7"
                            />
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                        <Button variant="secondary" size="sm" onClick={() => setEditing(role)}>
                          <IconUser size={15} />
                          Members
                        </Button>
                        <IconButton
                          label={`Delete role ${role.oauthRoleName}`}
                          onClick={() => setDeleting(role)}
                          className="text-danger hover:bg-danger/10 hover:text-danger"
                        >
                          <IconTrash size={17} />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      <CreateRoleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        oauthClientAppId={selectedAppId}
        onCreated={loadRoles}
      />

      <RoleMembersModal
        open={Boolean(editing)}
        role={editing}
        oauthClientAppId={selectedAppId}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deletePending}
        destructive
        title="Delete this role?"
        description={`${deleting?.oauthRoleName ?? 'This role'} will be removed from every user assigned to it.`}
        confirmLabel="Delete role"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** Searchable application picker. */
function AppCombobox({ apps, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const matches = useMemo(() => {
    if (!apps) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter(
      (app) =>
        app.oauthAppName?.toLowerCase().includes(needle) ||
        app.clientId?.toLowerCase().includes(needle),
    );
  }, [apps, query]);

  if (apps === null) return <Skeleton className="h-11 w-full rounded-xl" />;

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">
            {selected.oauthAppName}
          </span>
          <span className="block truncate font-mono text-[0.7rem] text-ink-faint">
            {selected.clientId}
          </span>
        </span>
        <IconButton label="Clear selected application" onClick={() => onSelect(null)}>
          <IconClose size={17} />
        </IconButton>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="app-listbox"
          aria-label="Search applications"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for an application…"
          autoComplete="off"
          className={cn(
            'w-full rounded-xl border border-hairline bg-canvas-raised/70 px-3.5 py-2.5 pr-10',
            'text-[0.95rem] text-ink transition-[border-color,box-shadow]',
            'hover:border-hairline-strong',
            'focus:border-accent focus:ring-4 focus:ring-accent/20 focus:outline-none',
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-ink-faint">
          <IconChevronDown size={18} />
        </span>
      </div>

      {open && (
        <ul
          id="app-listbox"
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-hairline bg-canvas-raised/98 p-1 shadow-2xl backdrop-blur-xl"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-center text-sm text-ink-muted">No applications found</li>
          ) : (
            matches.map((app) => (
              <li key={app.oauthClientAppId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onSelect(app);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface tap-target"
                >
                  <span className="block truncate text-sm font-medium text-ink">
                    {app.oauthAppName}
                  </span>
                  <span className="block truncate font-mono text-[0.7rem] text-ink-faint">
                    {app.clientId}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateRoleModal({ open, onClose, oauthClientAppId, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || pending) return;

    setPending(true);
    try {
      await api.post('/api/oauth/settings/roles/add', {
        oauthClientAppId,
        oauthRoleName: name.trim(),
      });
      toast.success('Role created.');
      await onCreated();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Could not create the role.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New role"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button
            form="create-role-form"
            type="submit"
            loading={pending}
            disabled={!name.trim()}
            fullWidth
            className="sm:w-auto"
          >
            Create role
          </Button>
        </>
      }
    >
      <form id="create-role-form" onSubmit={submit} noValidate>
        <TextInput
          label="Role name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="admin"
          autoCapitalize="off"
          required
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

const MEMBER_MODES = [
  { value: 'single', label: 'Add or remove' },
  { value: 'bulk', label: 'Bulk edit' },
];

const BULK_KEYS = [
  { value: 'ids', label: 'User IDs' },
  { value: 'names', label: 'Usernames' },
];

/**
 * Role membership editor.
 *
 * Two modes, matching the two API shapes: one-at-a-time add/remove with
 * username autocomplete, and a bulk JSON replace keyed either by user ID or by
 * username.
 */
function RoleMembersModal({ open, role, oauthClientAppId, onClose }) {
  const toast = useToast();
  const [mode, setMode] = useState('single');
  const [bulkKey, setBulkKey] = useState('ids');
  const [members, setMembers] = useState(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!role) return;
    setMembers(null);
    try {
      const { data } = await api.post('/api/oauth/settings/roles/get-users', {
        oauthRoleId: role.oauthRoleId,
        oauthClientAppId,
      });
      setMembers({
        ids: data?.oauthUserIds ?? [],
        names: data?.oauthUserNames ?? [],
      });
    } catch (error) {
      toast.error(error.message || 'Could not load the role members.');
      setMembers({ ids: [], names: [] });
    }
  }, [role, oauthClientAppId, toast]);

  useEffect(() => {
    if (open) {
      setMode('single');
      setBulkKey('ids');
      load();
    }
  }, [open, load]);

  // Keep the JSON textarea in sync with whichever key the user is editing.
  useEffect(() => {
    if (!members) return;
    const key = bulkKey === 'ids' ? 'oauthUserIds' : 'oauthUserNames';
    setDraft(JSON.stringify({ [key]: members[bulkKey] }, null, 2));
  }, [members, bulkKey]);

  const applySingle = async (action, identifier) => {
    setPending(true);
    try {
      const { data } = await api.post(`/api/oauth/settings/roles/update/${action}-user`, {
        oauthRoleId: role.oauthRoleId,
        oauthClientAppId,
        userId_or_username: identifier,
      });
      setMembers({ ids: data?.oauthUserIds ?? [], names: data?.oauthUserNames ?? [] });
      toast.success(data?.message || (action === 'add' ? 'User added.' : 'User removed.'));
    } catch (error) {
      toast.error(error.message || 'Could not update the role.');
    } finally {
      setPending(false);
    }
  };

  const saveBulk = async () => {
    let parsed;
    const key = bulkKey === 'ids' ? 'oauthUserIds' : 'oauthUserNames';

    try {
      parsed = JSON.parse(draft);
    } catch {
      toast.error('That is not valid JSON.');
      return;
    }

    if (!Array.isArray(parsed?.[key])) {
      toast.error(`Expected a JSON object with an array under "${key}".`);
      return;
    }

    setPending(true);
    try {
      const payloadKey = bulkKey === 'ids' ? 'oauthRoleUserIds' : 'oauthRoleUserNames';
      const { data } = await api.post('/api/oauth/settings/roles/update/bulk-update', {
        oauthRoleId: role.oauthRoleId,
        oauthClientAppId,
        [payloadKey]: parsed[key],
      });
      setMembers({ ids: data?.oauthUserIds ?? [], names: data?.oauthUserNames ?? [] });
      toast.success('Members updated.');
    } catch (error) {
      toast.error(error.message || 'Could not update the members.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? `Members of ${role.oauthRoleName}` : 'Role members'}
      description={
        members ? `${members.ids.length} user${members.ids.length === 1 ? '' : 's'} assigned.` : undefined
      }
      size="lg"
      footer={
        mode === 'bulk' ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending} fullWidth className="sm:w-auto">
              Close
            </Button>
            <Button onClick={saveBulk} loading={pending} disabled={!members} fullWidth className="sm:w-auto">
              Save members
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto sm:ml-auto">
            Done
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <SegmentedControl
          label="Editing mode"
          options={MEMBER_MODES}
          value={mode}
          onChange={setMode}
        />

        {members === null ? (
          <div className="grid place-items-center py-10">
            <Spinner size={24} className="text-ink-faint" label="Loading members" />
          </div>
        ) : mode === 'single' ? (
          <SingleMemberEditor
            oauthClientAppId={oauthClientAppId}
            members={members}
            pending={pending}
            onApply={applySingle}
          />
        ) : (
          <div className="space-y-3">
            <SegmentedControl
              label="Identify users by"
              options={BULK_KEYS}
              value={bulkKey}
              onChange={setBulkKey}
            />
            <TextArea
              label="Members"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              hint="Replaces the full member list with the array below."
              rows={10}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/** Username autocomplete plus the current member list. */
function SingleMemberEditor({ oauthClientAppId, members, pending, onApply }) {
  const [identifier, setIdentifier] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);

  // Debounced lookup; aborts the previous request so late responses cannot
  // overwrite the suggestions for a newer query.
  useEffect(() => {
    const term = identifier.trim();
    if (!term || !oauthClientAppId) {
      setSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(
          `/api/oauth/users/search?query=${encodeURIComponent(term)}&oauthClientAppId=${encodeURIComponent(oauthClientAppId)}`,
          { signal: controller.signal },
        );
        setSuggestions(Array.isArray(data?.userName) ? data.userName : []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [identifier, oauthClientAppId]);

  const apply = async (action) => {
    const value = identifier.trim();
    if (!value) return;
    await onApply(action, value);
    setIdentifier('');
    setSuggestions([]);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <TextInput
          label="User ID or username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          trailing={
            searching ? <Spinner size={16} className="mr-2 text-ink-faint" /> : undefined
          }
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-30 mt-1.5 max-h-48 w-full overflow-y-auto rounded-xl border border-hairline bg-canvas-raised/98 p-1 shadow-2xl backdrop-blur-xl">
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier(name);
                    setSuggestions([]);
                  }}
                  className="w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface tap-target"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={() => apply('add')}
          loading={pending}
          disabled={!identifier.trim()}
          fullWidth
        >
          Add to role
        </Button>
        <Button
          variant="outlineDanger"
          onClick={() => apply('remove')}
          disabled={pending || !identifier.trim()}
          fullWidth
        >
          Remove from role
        </Button>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
          Current members
        </p>
        {members.names.length === 0 ? (
          <p className="text-sm text-ink-muted">No users assigned to this role yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {members.names.map((name) => (
              <Badge key={name} tone="accent">
                {name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
