import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { PasswordInput, SegmentedControl, Switch, TextInput } from '@/components/ui/Field';
import { IconPlus, IconUser } from '@/components/ui/Icons';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatDate, initial } from '@/lib/format';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'banned', label: 'Suspended' },
  { value: 'unverified', label: 'Unverified' },
];

export function AdminUsersPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get('status') || 'all';
  const page = Math.max(Number.parseInt(searchParams.get('page'), 10) || 1, 1);

  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setResult(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25', status });
      const search = searchParams.get('query');
      if (search) params.set('query', search);

      const { data } = await api.get(`/api/admin/users?${params}`);
      setResult(data);
      setError(null);
    } catch (requestError) {
      setError(requestError.message || 'Could not load users.');
      setResult({ users: [], total: 0, totalPages: 1, page: 1 });
    }
  }, [page, status, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce the search into the URL, which is what actually drives the query.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      const current = next.get('query') || '';
      if (current === query.trim()) return;
      if (query.trim()) next.set('query', query.trim());
      else next.delete('query');
      next.delete('page');
      setSearchParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, searchParams, setSearchParams]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <Card>
        <CardHeader
          title={
            <>
              Users
              {result && <Badge tone="neutral">{result.total}</Badge>}
            </>
          }
          actions={
            <>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Name, username, email or ID"
                label="Search users"
                className="w-full sm:w-72"
              />
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <IconPlus size={16} />
                New user
              </Button>
            </>
          }
        >
          <div className="mt-3 sm:mt-4">
            <SegmentedControl
              label="Filter by status"
              options={STATUS_FILTERS}
              value={status}
              onChange={(value) => setParam('status', value)}
              className="max-w-md"
            />
          </div>
        </CardHeader>

        <CardBody>
          {result === null ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-xl sm:h-16" />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Something went wrong" description={error} />
          ) : result.users.length === 0 ? (
            <EmptyState
              icon={<IconUser size={22} />}
              title="No matching users"
              description="Try a different search term or filter."
            />
          ) : (
            <ul className="space-y-2.5">
              {result.users.map((user) => (
                <li key={user.userId}>
                  <Link
                    to={`/admin/users/${encodeURIComponent(user.userId)}`}
                    className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-3.5 transition-colors hover:border-hairline-strong sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-cyan text-sm font-semibold text-white">
                        {initial(user.firstName || user.username)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') ||
                            user.username}
                        </p>
                        <p className="truncate text-xs text-ink-muted">{user.email}</p>
                        <p className="truncate font-mono text-[0.68rem] text-ink-faint">
                          {user.userId} · joined {formatDate(user.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {user.isAdmin && <Badge tone="danger">Admin</Badge>}
                      {user.banned && <Badge tone="danger">Suspended</Badge>}
                      {!user.emailVerified && <Badge tone="warning">Unverified</Badge>}
                      {user.effectiveCanManageApps && <Badge tone="cyan">App manager</Badge>}
                      {user.mfaEnabled && <Badge tone="positive">2FA</Badge>}
                      <Badge tone="neutral">{user.identityProvider}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {result && result.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setParam('page', String(page - 1))}
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
                onClick={() => setParam('page', String(page + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          toast.success('User created.');
          await load();
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

const EMPTY_USER = {
  firstName: '',
  lastName: '',
  username: '',
  email: '',
  password: '',
};

function CreateUserModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_USER);
  const [emailVerified, setEmailVerified] = useState(true);
  const [canManageApps, setCanManageApps] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_USER);
      setEmailVerified(true);
      setCanManageApps(false);
    }
  }, [open]);

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const canSubmit =
    form.username.trim() && form.email.trim() && form.password.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || pending) return;

    setPending(true);
    try {
      await api.post('/api/admin/users', { ...form, emailVerified, canManageApps });
      await onCreated();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Could not create the user.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a user"
      description="Provisions an account directly, without going through public signup."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button
            form="admin-create-user"
            type="submit"
            loading={pending}
            disabled={!canSubmit}
            fullWidth
            className="sm:w-auto"
          >
            Create user
          </Button>
        </>
      }
    >
      {/* This provisions someone else's account, so the identity fields opt out
          of autofill. Only the password keeps `new-password`, which lets a
          manager generate a strong temporary one without offering to save the
          admin's own credentials against it. */}
      <form id="admin-create-user" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput
            label="First name"
            value={form.firstName}
            onChange={update('firstName')}
            autoComplete="off"
          />
          <TextInput
            label="Last name"
            value={form.lastName}
            onChange={update('lastName')}
            autoComplete="off"
          />
        </div>
        <TextInput
          label="Username"
          value={form.username}
          onChange={update('username')}
          hint="3-20 characters: letters, numbers and dashes."
          autoCapitalize="off"
          autoComplete="off"
          required
        />
        <TextInput
          label="Email"
          type="email"
          inputMode="email"
          value={form.email}
          onChange={update('email')}
          autoCapitalize="off"
          autoComplete="off"
          required
        />
        <PasswordInput
          label="Temporary password"
          name="newUserPassword"
          value={form.password}
          onChange={update('password')}
          hint="At least 8 characters with upper and lower case, a digit and a symbol."
          autoComplete="new-password"
          required
        />

        <div className="space-y-4 rounded-xl border border-hairline bg-surface p-3.5">
          <Switch
            label="Email already verified"
            description="Leave on if you are vouching for this address. Turn off to make the user confirm it by email."
            checked={emailVerified}
            onChange={setEmailVerified}
          />
          <Switch
            label="May manage OIDC applications"
            description="Off for ordinary users. Only enable for people who need to register their own clients."
            checked={canManageApps}
            onChange={setCanManageApps}
          />
        </div>
      </form>
    </Modal>
  );
}
