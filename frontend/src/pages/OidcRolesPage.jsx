import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/layouts/AppLayout';
import { DocsLink } from '@/components/DocsLink';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyField';
import { Field, SegmentedControl, Switch, TextArea, TextInput } from '@/components/ui/Field';
import {
  IconApps,
  IconBack,
  IconBook,
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconRoles,
  IconTrash,
  IconUser,
} from '@/components/ui/Icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton, Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api, SessionExpiredError } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * A role assigned to '*' applies to every user, so it has no countable members.
 * The stored value is either an array of ids or the bare string '*', so both
 * shapes have to be read here.
 */
function memberSummary(role) {
  const raw = role?.oauthUserIds;
  const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (ids.includes('*')) return { everyone: true, count: null, label: 'Everyone' };
  return { everyone: false, count: ids.length, label: `${ids.length} member${ids.length === 1 ? '' : 's'}` };
}

export function OidcRolesPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // The app id in the URL is a filter, not a prerequisite: roles for every
  // application load straight away and this only narrows the list. Kept in the
  // URL so an existing deep link still lands on the right application.
  const appFilter = searchParams.get('oauthAppId');

  const [apps, setApps] = useState(null);
  const [roles, setRoles] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [createFor, setCreateFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletePending, setDeletePending] = useState(false);

  const deferredQuery = useDeferredValue(query);

  const load = useCallback(async () => {
    try {
      // Both in one pass: the roles response is authoritative for the list, the
      // apps response is what lets someone create a role for an app that has
      // none yet.
      const [appsResponse, rolesResponse] = await Promise.all([
        api.get('/api/oauth/settings/apps/get'),
        api.post('/api/oauth/settings/roles/get', {}),
      ]);
      setApps(appsResponse.data?.oauthApps ?? []);
      setRoles(rolesResponse.data?.oauthRoles ?? []);
      setError(null);
    } catch (requestError) {
      // The session guard is already redirecting; no error state needed.
      if (requestError instanceof SessionExpiredError) return;
      setApps((current) => current ?? []);
      setRoles([]);
      setError('Could not load your roles. Try again in a moment.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setAppFilter = (appId) => {
    const next = new URLSearchParams(searchParams);
    if (appId) next.set('oauthAppId', appId);
    else next.delete('oauthAppId');
    setSearchParams(next, { replace: true });
  };

  /** Roles grouped by application, filtered by the app filter and the search box. */
  const groups = useMemo(() => {
    if (!apps || !roles) return null;

    const needle = deferredQuery.trim().toLowerCase();
    const matchesQuery = (role, app) => {
      if (!needle) return true;
      return (
        role.oauthRoleName?.toLowerCase().includes(needle) ||
        role.oauthRoleId?.toLowerCase().includes(needle) ||
        app?.oauthAppName?.toLowerCase().includes(needle) ||
        app?.clientId?.toLowerCase().includes(needle)
      );
    };

    const appById = new Map(apps.map((app) => [String(app.oauthClientAppId), app]));
    const rolesByApp = new Map();

    for (const role of roles) {
      const key = String(role.oauthClientAppId);
      if (appFilter && key !== String(appFilter)) continue;
      if (!matchesQuery(role, appById.get(key))) continue;
      if (!rolesByApp.has(key)) rolesByApp.set(key, []);
      rolesByApp.get(key).push(role);
    }

    // Every application the user owns gets a group, so an app with no roles is
    // still a place to create one rather than being invisible.
    return apps
      .filter((app) => !appFilter || String(app.oauthClientAppId) === String(appFilter))
      .map((app) => ({
        app,
        roles: (rolesByApp.get(String(app.oauthClientAppId)) ?? []).sort((a, b) =>
          (a.oauthRoleName ?? '').localeCompare(b.oauthRoleName ?? ''),
        ),
      }))
      .filter((group) => !needle || group.roles.length > 0)
      .sort((a, b) => (a.app.oauthAppName ?? '').localeCompare(b.app.oauthAppName ?? ''));
  }, [apps, roles, appFilter, deferredQuery]);

  const visibleRoleCount = groups?.reduce((total, group) => total + group.roles.length, 0) ?? 0;
  const totalRoleCount = roles?.length ?? 0;

  const confirmDelete = async () => {
    setDeletePending(true);
    try {
      await api.post('/api/oauth/settings/roles/delete', {
        oauthClientAppId: deleting.oauthClientAppId,
        oauthRoleId: deleting.oauthRoleId,
      });
      toast.success(`Role ${deleting.oauthRoleName} was deleted.`);
      setDeleting(null);
      await load();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not delete the role.');
    } finally {
      setDeletePending(false);
    }
  };

  // Sensible default for the create dialog: the app being filtered on, or the
  // only app there is.
  const defaultCreateAppId = appFilter ?? (apps?.length === 1 ? apps[0].oauthClientAppId : null);

  return (
    <>
      <PageHeader
        title="Roles"
        description="Assign users to application-specific roles that are embedded in their tokens."
        actions={
          <Button as={DocsLink} to="/docs/client-registration#roles" variant="secondary" size="sm">
            <IconBook size={16} />
            How roles work
          </Button>
        }
      />

      <Card>
        <CardHeader
          title={
            <>
              Roles
              {roles && (
                <Badge tone="neutral">
                  {visibleRoleCount === totalRoleCount
                    ? totalRoleCount
                    : `${visibleRoleCount} of ${totalRoleCount}`}
                </Badge>
              )}
            </>
          }
          actions={
            <>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search roles or apps"
                label="Search roles and applications"
                className="w-full sm:w-60"
              />
              <AppSelect
                apps={apps}
                value={appFilter}
                onChange={setAppFilter}
                allLabel="All applications"
                className="w-full sm:w-56"
              />
              <Button
                onClick={() => setCreateFor(defaultCreateAppId ?? '')}
                size="sm"
                disabled={!apps || apps.length === 0}
              >
                <IconPlus size={16} />
                New role
              </Button>
            </>
          }
        />
        <CardBody>
          {groups === null ? (
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              title="Something went wrong"
              description={error}
              action={<Button onClick={load}>Try again</Button>}
            />
          ) : apps.length === 0 ? (
            <EmptyState
              icon={<IconApps size={22} />}
              title="No applications yet"
              description="Roles belong to an application. Register one first, then come back to define its roles."
              action={
                <Button as={Link} to="/oidc/apps" variant="secondary">
                  Go to applications
                </Button>
              }
            />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<IconRoles size={22} />}
              title="No matching roles"
              description="Nothing matches that search. Try a different term or clear the application filter."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setAppFilter(null);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {groups.map(({ app, roles: appRoles }) => (
                <section key={app.oauthClientAppId}>
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-strong text-ink-muted">
                        <IconApps size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {app.oauthAppName}
                        </p>
                        <code
                          className="block truncate font-mono text-[0.7rem] text-ink-faint"
                          title={app.clientId}
                        >
                          {app.clientId}
                        </code>
                      </div>
                      <Badge tone="neutral">{appRoles.length}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreateFor(app.oauthClientAppId)}
                    >
                      <IconPlus size={15} />
                      Add role
                    </Button>
                  </div>

                  {appRoles.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-hairline px-3.5 py-4 text-sm text-ink-muted">
                      No roles for this application yet.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {appRoles.map((role) => {
                        const members = memberSummary(role);
                        return (
                          <li
                            key={role.oauthRoleId}
                            className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-strong text-ink-muted">
                                <IconRoles size={18} />
                              </span>
                              <div className="min-w-0">
                                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                                  <span className="truncate">{role.oauthRoleName}</span>
                                  <Badge tone={members.everyone ? 'cyan' : 'neutral'}>
                                    {members.label}
                                  </Badge>
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
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setEditing(role)}
                              >
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
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <CreateRoleModal
        open={createFor !== null}
        onClose={() => setCreateFor(null)}
        apps={apps ?? []}
        initialAppId={createFor || null}
        onCreated={load}
      />

      <RoleMembersModal
        open={Boolean(editing)}
        role={editing}
        onClose={() => setEditing(null)}
        onChanged={load}
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

/**
 * Application dropdown.
 *
 * Doubles as the list filter and as the app chooser inside the create dialog.
 * `allLabel` turns the "no selection" entry into a real option ("All
 * applications") rather than an empty state.
 */
function AppSelect({ apps, value, onChange, allLabel, placeholder = 'Choose an application', className }) {
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

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selected = apps?.find((app) => String(app.oauthClientAppId) === String(value));

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

  if (apps === null) return <Skeleton className={cn('h-10 rounded-xl', className)} />;

  const choose = (appId) => {
    onChange(appId);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2',
          'text-left text-sm transition-[border-color,box-shadow]',
          'focus:border-accent focus:ring-4 focus:ring-accent/20 focus:outline-none',
          selected
            ? 'border-accent/30 bg-accent/10 text-ink'
            : 'border-hairline bg-canvas-raised/70 text-ink-muted hover:border-hairline-strong',
        )}
      >
        <span className="min-w-0 truncate">
          {selected ? selected.oauthAppName : (allLabel ?? placeholder)}
        </span>
        <IconChevronDown size={16} className="shrink-0 text-ink-faint" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full min-w-56 rounded-xl border border-hairline bg-canvas-raised/98 p-1 shadow-2xl backdrop-blur-xl">
          {apps.length > 6 && (
            <div className="p-1">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter applications…"
                aria-label="Filter applications"
                autoComplete="off"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full rounded-lg border border-hairline bg-canvas-raised/70 px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>
          )}

          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {allLabel && (
              <li>
                <OptionButton selected={!value} onClick={() => choose(null)} label={allLabel} />
              </li>
            )}
            {matches.length === 0 ? (
              <li className="px-3 py-3 text-center text-sm text-ink-muted">
                No applications found
              </li>
            ) : (
              matches.map((app) => (
                <li key={app.oauthClientAppId}>
                  <OptionButton
                    selected={String(app.oauthClientAppId) === String(value)}
                    onClick={() => choose(app.oauthClientAppId)}
                    label={app.oauthAppName}
                    hint={app.clientId}
                  />
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Application picker that collapses to the chosen application.
 *
 * Expands in flow rather than floating: the modal panel clips overflow, so a
 * dropdown would be cut off by the footer and would cover the field above it.
 * Once something is picked the list closes and only that application is shown,
 * which keeps the dialog short; clicking it opens the list again.
 */
function AppPicker({ apps, value, onChange }) {
  const [query, setQuery] = useState('');
  // Only tracks a deliberate "I want to change this". With nothing selected the
  // list is open regardless, so this stays false until the user asks for it.
  const [changing, setChanging] = useState(false);
  const listRef = useRef(null);
  const showFilter = apps.length > 5;

  // The dialog reuses this component across opens, so a selection arriving from
  // outside (the per-app "Add role" button) has to close the list too.
  useEffect(() => {
    setChanging(false);
  }, [value]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter(
      (app) =>
        app.oauthAppName?.toLowerCase().includes(needle) ||
        app.clientId?.toLowerCase().includes(needle),
    );
  }, [apps, query]);

  const selected = apps.find((app) => String(app.oauthClientAppId) === String(value));
  const listOpen = changing || !selected;

  const choose = (appId) => {
    setQuery('');
    setChanging(false);
    onChange(appId);
  };

  // Nothing to choose from: show what the role will belong to instead of a
  // one-option picker.
  if (apps.length === 1) {
    const [only] = apps;
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2">
        <span className="block truncate text-sm font-medium text-ink">{only.oauthAppName}</span>
        <span className="block truncate font-mono text-[0.7rem] text-ink-faint">
          {only.clientId}
        </span>
      </div>
    );
  }

  if (!listOpen) {
    return (
      <button
        type="button"
        onClick={() => setChanging(true)}
        aria-label={`Application: ${selected.oauthAppName}. Choose a different one`}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-accent/15 px-3 py-2.5 text-left',
          'transition-colors hover:bg-accent/20',
          'focus:ring-4 focus:ring-accent/20 focus:outline-none tap-target',
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-white">
          <IconCheck size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {selected.oauthAppName}
          </span>
          <span className="block truncate font-mono text-[0.7rem] text-ink-muted">
            {selected.clientId}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-ink-muted">Change</span>
        <IconChevronDown size={16} className="shrink-0 text-ink-faint" />
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-canvas-raised/40">
      {showFilter && (
        <div className="border-b border-hairline p-1.5">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter applications…"
            aria-label="Filter applications"
            autoComplete="off"
            className="w-full rounded-lg border border-hairline bg-canvas-raised/70 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {matches.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-ink-muted">No applications found</p>
      ) : (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Application"
          className="max-h-52 space-y-0.5 overflow-y-auto p-1"
        >
          {matches.map((app) => (
            <li key={app.oauthClientAppId}>
              <OptionButton
                selected={String(app.oauthClientAppId) === String(value)}
                onClick={() => choose(app.oauthClientAppId)}
                label={app.oauthAppName}
                hint={app.clientId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OptionButton({ selected, onClick, label, hint }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors tap-target',
        // Selection has to beat hover at a glance, so it carries a ring and a
        // filled check rather than a tint that reads as "pointer is here".
        selected
          ? 'bg-accent/20 ring-1 ring-inset ring-accent/60'
          : 'hover:bg-surface',
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            selected ? 'font-semibold text-ink' : 'font-medium text-ink',
          )}
        >
          {label}
        </span>
        {hint && (
          <span
            className={cn(
              'block truncate font-mono text-[0.7rem]',
              selected ? 'text-ink-muted' : 'text-ink-faint',
            )}
          >
            {hint}
          </span>
        )}
      </span>
      {selected ? (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-white">
          <IconCheck size={13} />
        </span>
      ) : (
        // Reserve the space so rows do not shift when selection moves.
        <span aria-hidden className="size-5 shrink-0" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function CreateRoleModal({ open, onClose, apps, initialAppId, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [appId, setAppId] = useState(initialAppId);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setAppId(initialAppId);
    }
  }, [open, initialAppId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || !appId || pending) return;

    setPending(true);
    try {
      await api.post('/api/oauth/settings/roles/add', {
        oauthClientAppId: appId,
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
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button
            form="create-role-form"
            type="submit"
            loading={pending}
            disabled={!name.trim() || !appId}
            fullWidth
            className="sm:w-auto"
          >
            Create role
          </Button>
        </>
      }
    >
      <form id="create-role-form" onSubmit={submit} noValidate className="space-y-4">
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
        <Field
          label="Application"
          required
          hint="The role is only visible in this application's tokens."
        >
          <AppPicker apps={apps} value={appId} onChange={setAppId} />
        </Field>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/** The add/remove endpoints accept either identifier; ids are numeric strings. */
function identifierFor(member) {
  return /^\d+$/.test(String(member.userId)) ? String(member.userId) : member.username;
}

/**
 * Role membership editor.
 *
 * Three ways to express membership, in the order people reach for them: a table
 * of current members with per-row removal, a search box to add someone, and a
 * switch for the wildcard assignment that gives the role to every user. The
 * JSON editor is kept at the bottom for pasting a list in bulk.
 *
 * The application comes from the role itself, so this works from a list that
 * spans every application.
 */
function RoleMembersModal({ open, role, onClose, onChanged }) {
  const toast = useToast();
  const oauthClientAppId = role?.oauthClientAppId ?? null;

  const [data, setData] = useState(null);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmEveryone, setConfirmEveryone] = useState(null);
  const [memberFilter, setMemberFilter] = useState('');

  const load = useCallback(async () => {
    if (!role) return;
    try {
      const { data: response } = await api.post('/api/oauth/settings/roles/get-users', {
        oauthRoleId: role.oauthRoleId,
        oauthClientAppId,
      });
      setData({
        everyone: Boolean(response?.everyone),
        members: response?.members ?? [],
      });
    } catch (error) {
      if (error instanceof SessionExpiredError) return;
      toast.error(error.message || 'Could not load the role members.');
      setData({ everyone: false, members: [] });
    }
  }, [role, oauthClientAppId, toast]);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setAdding(false);
    setConfirmRemove(null);
    setConfirmEveryone(null);
    setMemberFilter('');
    setDirty(false);
    load();
  }, [open, load]);

  // Filtering the members already on screen is a local concern: the whole list
  // is in memory, so there is nothing to ask the server for.
  const visibleMembers = useMemo(() => {
    const list = data?.members ?? [];
    const needle = memberFilter.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (member) =>
        member.username?.toLowerCase().includes(needle) ||
        member.email?.toLowerCase().includes(needle) ||
        String(member.userId).includes(needle),
    );
  }, [data, memberFilter]);

  // Refresh the page's role list on the way out so the member counts match.
  const close = () => {
    if (dirty) onChanged?.();
    onClose();
  };

  /**
   * Run a membership mutation and re-read the list.
   *
   * The add/remove endpoints answer with a message rather than the new member
   * list, so the list has to be re-read; trusting the response here is what
   * used to blank the members out after every change.
   */
  const mutate = async (request, successMessage) => {
    setPending(true);
    try {
      await request();
      await load();
      setDirty(true);
      if (successMessage) toast.success(successMessage);
      return true;
    } catch (error) {
      toast.error(error.message || 'Could not update the role.');
      return false;
    } finally {
      setPending(false);
    }
  };

  const addUser = (user) =>
    mutate(
      () =>
        api.post('/api/oauth/settings/roles/update/add-user', {
          oauthRoleId: role.oauthRoleId,
          oauthClientAppId,
          userId_or_username: identifierFor(user),
        }),
      `${user.username} was added to the role.`,
    );

  const removeUser = async (member) => {
    const removed = await mutate(
      () =>
        api.post('/api/oauth/settings/roles/update/remove-user', {
          oauthRoleId: role.oauthRoleId,
          oauthClientAppId,
          userId_or_username: identifierFor(member),
        }),
      `${member.username} was removed from the role.`,
    );
    if (removed) setConfirmRemove(null);
  };

  // Wildcard on: the dedicated '*' path, which does not require the target to
  // have authorized the application. Off: an explicit empty list, since there is
  // no "unset the wildcard" operation.
  const setEveryone = async (everyone) => {
    const applied = await mutate(
      () =>
        everyone
          ? api.post('/api/oauth/settings/roles/update/add-user', {
              oauthRoleId: role.oauthRoleId,
              oauthClientAppId,
              userId_or_username: '*',
            })
          : api.post('/api/oauth/settings/roles/update/bulk-update', {
              oauthRoleId: role.oauthRoleId,
              oauthClientAppId,
              oauthRoleUserIds: [],
            }),
      everyone
        ? 'The role now applies to every user.'
        : 'The role now applies only to users you assign.',
    );
    if (applied) {
      setConfirmEveryone(null);
      setAdding(false);
    }
  };

  const memberCount = data?.members.length ?? 0;
  const description = [
    role?.oauthAppName,
    data
      ? data.everyone
        ? 'Applies to every user.'
        : `${memberCount} user${memberCount === 1 ? '' : 's'} assigned.`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      open={open}
      onClose={close}
      title={role ? `Members of ${role.oauthRoleName}` : 'Role members'}
      description={description || undefined}
      size="lg"
      footer={
        <Button variant="secondary" onClick={close} fullWidth className="sm:w-auto sm:ml-auto">
          Done
        </Button>
      }
    >
      {data === null ? (
        <div className="grid place-items-center py-12">
          <Spinner size={24} className="text-ink-faint" label="Loading members" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-hairline bg-canvas-raised/40 px-3.5 py-3">
            <Switch
              checked={data.everyone}
              onChange={(checked) => setConfirmEveryone(checked ? 'enable' : 'disable')}
              disabled={pending}
              label="Apply to everyone"
              description="Every user gets this role in their token for this application, with no individual assignment."
            />

            {confirmEveryone && (
              <ConfirmBar
                tone={confirmEveryone === 'enable' ? 'warning' : 'danger'}
                message={
                  confirmEveryone === 'enable'
                    ? 'Every user of this application will receive this role.'
                    : memberCount > 0
                      ? 'The wildcard is replaced by an empty list. Members are not restored.'
                      : 'The role will apply to nobody until you add users.'
                }
                confirmLabel={confirmEveryone === 'enable' ? 'Apply to everyone' : 'Turn off'}
                pending={pending}
                onConfirm={() => setEveryone(confirmEveryone === 'enable')}
                onCancel={() => setConfirmEveryone(null)}
              />
            )}
          </div>

          {data.everyone ? (
            <p className="rounded-xl border border-dashed border-hairline px-3.5 py-6 text-center text-sm text-ink-muted">
              This role is assigned with the <code className="font-mono">*</code> wildcard, so
              there is no member list to manage.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                  {adding ? 'Add a user' : 'Members'}
                </p>
                {!adding && <Badge tone="neutral">{memberCount}</Badge>}
                {adding ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setAdding(false)}
                  >
                    <IconBack size={15} />
                    Back to members
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={() => setAdding(true)}
                    disabled={pending}
                  >
                    <IconPlus size={15} />
                    Add user
                  </Button>
                )}
              </div>

              {/* One region, two views. Swapping in place keeps the dialog from
                  growing and pushing the member list out from under the cursor. */}
              <div className="min-h-[15rem]">
                {adding ? (
                  <AddMemberPanel
                    oauthClientAppId={oauthClientAppId}
                    memberIds={new Set(data.members.map((member) => String(member.userId)))}
                    pending={pending}
                    onAdd={addUser}
                  />
                ) : (
                  <MembersTable
                    members={visibleMembers}
                    filtered={visibleMembers.length !== data.members.length}
                    filter={memberFilter}
                    onFilterChange={setMemberFilter}
                    pending={pending}
                    confirmRemove={confirmRemove}
                    onConfirmRemove={setConfirmRemove}
                    onRemove={removeUser}
                  />
                )}
              </div>
            </>
          )}

          <BulkEditor
            role={role}
            oauthClientAppId={oauthClientAppId}
            members={data.members}
            onSaved={async () => {
              await load();
              setDirty(true);
            }}
          />
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/** Inline two-step confirmation, used where a nested dialog would be overkill. */
function ConfirmBar({ tone = 'danger', message, confirmLabel, pending, onConfirm, onCancel }) {
  return (
    <div
      className={cn(
        'mt-3 flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
        tone === 'danger' ? 'border-danger/30 bg-danger/10' : 'border-warning/30 bg-warning/10',
      )}
    >
      <p className="text-sm text-ink">{message}</p>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          size="sm"
          onClick={onConfirm}
          loading={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Current members, one row each, with a two-step remove. */
function MembersTable({
  members,
  filtered,
  filter,
  onFilterChange,
  pending,
  confirmRemove,
  onConfirmRemove,
  onRemove,
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline">
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface-strong/95 backdrop-blur">
            <tr className="text-left text-xs font-medium tracking-wide text-ink-faint uppercase">
              <th scope="col" className="px-3 py-2 font-medium">
                User
              </th>
              <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
                Email
              </th>
              {/* The filter belongs to the list, so it lives in the list's own
                  header rather than floating above the table. `normal-case`
                  undoes the uppercase inherited from the header row. */}
              <th scope="col" className="px-3 py-1.5 normal-case">
                <div className="flex justify-end">
                  <SearchInput
                    value={filter}
                    onChange={onFilterChange}
                    placeholder="Filter"
                    label="Filter members by username or email"
                    className="w-32 sm:w-44 [&_input]:py-1.5 [&_input]:pl-9 [&_input]:text-sm"
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr className="border-t border-hairline">
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-ink-muted">
                  {filtered ? (
                    'No members match that filter.'
                  ) : (
                    <>
                      No users assigned yet. Use <span className="text-ink">Add user</span> to
                      assign someone.
                    </>
                  )}
                </td>
              </tr>
            )}
            {members.map((member) => {
              const confirming = confirmRemove === member.userId;
              return (
                <tr
                  key={member.userId}
                  className={cn(
                    'border-t border-hairline align-middle',
                    confirming && 'bg-danger/10',
                  )}
                >
                  <td className="px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-strong text-ink-muted">
                        <IconUser size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {member.username}
                        </span>
                        <span className="block truncate font-mono text-[0.7rem] text-ink-faint">
                          {member.userId}
                        </span>
                        {/* The email column is hidden on phones, so it moves under the name. */}
                        {member.email && (
                          <span className="block truncate text-xs text-ink-muted sm:hidden">
                            {member.email}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="hidden max-w-[16rem] px-3 py-2.5 sm:table-cell">
                    {member.missing ? (
                      <Badge tone="warning">Account deleted</Badge>
                    ) : (
                      <span className="block truncate text-ink-muted">{member.email || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {confirming ? (
                      <span className="inline-flex gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onConfirmRemove(null)}
                          disabled={pending}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => onRemove(member)}
                          loading={pending}
                        >
                          Confirm
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onConfirmRemove(member.userId)}
                        disabled={pending}
                        className="text-danger hover:bg-danger/10 hover:text-danger"
                      >
                        <IconTrash size={15} />
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * User search for adding a member.
 *
 * Scoped to the application, so the results are the users who have authorized
 * it — the same set the add endpoint accepts. Matching is on username, email or
 * user id.
 */
function AddMemberPanel({ oauthClientAppId, memberIds, pending, onAdd }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // Debounced lookup; aborts the previous request so a late response cannot
  // overwrite the results for a newer query.
  useEffect(() => {
    const term = query.trim();
    if (!term || !oauthClientAppId) {
      setResults(null);
      setSearching(false);
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
        setResults(Array.isArray(data?.users) ? data.users : []);
      } catch (error) {
        if (error?.name !== 'AbortError') setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, oauthClientAppId]);

  const hasQuery = query.trim().length > 0;

  // Mirrors the members table: same frame, same row shape, search in the header.
  return (
    <div className="overflow-hidden rounded-xl border border-accent/30">
      <div className="border-b border-hairline bg-accent/[0.08] px-3 py-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by username or email"
          label="Search users to add"
          className="[&_input]:py-2 [&_input]:text-sm"
          autoFocus
        />
      </div>

      <div className="max-h-72 overflow-y-auto">
        {searching ? (
          <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-ink-muted">
            <Spinner size={14} /> Searching…
          </p>
        ) : results === null ? (
          <p className="px-3 py-8 text-center text-sm text-ink-muted">
            Type a username or email to find someone.
            <span className="mt-1 block text-xs text-ink-faint">
              Only users who have signed in to this application can be assigned a role.
            </span>
          </p>
        ) : results.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-ink-muted">
            No users match {hasQuery ? `“${query.trim()}”` : 'that search'}.
            <span className="mt-1 block text-xs text-ink-faint">
              Only users who have signed in to this application can be assigned a role.
            </span>
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {results.map((user) => {
              const already = memberIds.has(String(user.userId));
              return (
                <li
                  key={user.userId}
                  className="flex items-center justify-between gap-2 px-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-strong text-ink-muted">
                      <IconUser size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {user.username}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {user.email || user.userId}
                      </span>
                    </span>
                  </span>
                  {already ? (
                    <Badge tone="neutral">In role</Badge>
                  ) : (
                    <Button size="sm" onClick={() => onAdd(user)} disabled={pending}>
                      <IconPlus size={15} />
                      Add
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const BULK_KEYS = [
  { value: 'ids', label: 'User IDs' },
  { value: 'names', label: 'Usernames' },
];

/**
 * Collapsed JSON editor.
 *
 * Kept for the one thing the table cannot do: pasting a whole list at once. It
 * replaces the membership outright.
 */
function BulkEditor({ role, oauthClientAppId, members, onSaved }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [bulkKey, setBulkKey] = useState('ids');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  // Re-seed from the current membership whenever it changes or the key changes,
  // so the editor never shows a stale list.
  useEffect(() => {
    const key = bulkKey === 'ids' ? 'oauthUserIds' : 'oauthUserNames';
    const values =
      bulkKey === 'ids' ? members.map((m) => m.userId) : members.map((m) => m.username);
    setDraft(JSON.stringify({ [key]: values }, null, 2));
  }, [members, bulkKey, open]);

  const save = async () => {
    const key = bulkKey === 'ids' ? 'oauthUserIds' : 'oauthUserNames';
    let parsed;

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
      await api.post('/api/oauth/settings/roles/update/bulk-update', {
        oauthRoleId: role.oauthRoleId,
        oauthClientAppId,
        [payloadKey]: parsed[key],
      });
      await onSaved();
      toast.success('Members updated.');
    } catch (error) {
      toast.error(error.message || 'Could not update the members.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="border-t border-hairline pt-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen((current) => !current)}>
        <IconChevronDown
          size={15}
          className={cn('transition-transform', open && 'rotate-180')}
        />
        Bulk edit as JSON
      </Button>

      {open && (
        <div className="mt-3 space-y-3">
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
            hint='Replaces the full member list. Use ["*"] to apply the role to every user.'
            rows={8}
          />
          <Button onClick={save} loading={pending} size="sm">
            Save members
          </Button>
        </div>
      )}
    </div>
  );
}
