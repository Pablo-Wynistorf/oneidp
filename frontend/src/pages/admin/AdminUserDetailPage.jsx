import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { CopyField } from '@/components/ui/CopyField';
import { Switch, TextArea, TextInput } from '@/components/ui/Field';
import { IconBack, IconDevice, IconEdit, IconExternal, IconShield } from '@/components/ui/Icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, initial, originOf } from '@/lib/format';

/**
 * Why "Send recovery email" is unavailable, in the operator's terms.
 *
 * Only account-level reasons appear here: the instance-wide self-service switch
 * does not block an operator-sent link, so the button is always rendered.
 */
const RECOVERY_BLOCKED_HINT = {
  social: 'This account signs in through an external provider, so it has no password to recover.',
  unverifiedEmail: 'Mark the email address as verified before sending a recovery link to it.',
  banned: 'Restore the account before sending a recovery link.',
};

export function AdminUserDetailPage() {
  const { userId } = useParams();
  const toast = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: payload } = await api.get(`/api/admin/users/${encodeURIComponent(userId)}`);
      setData(payload);
      setError(null);
    } catch (requestError) {
      setError(requestError.message || 'Could not load this user.');
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Run a POST action, refresh, and surface any failure. */
  const act = async (key, path, body, successMessage) => {
    setBusy(key);
    try {
      await api.post(`/api/admin/users/${encodeURIComponent(userId)}${path}`, body);
      toast.success(successMessage);
      await load();
      return true;
    } catch (requestError) {
      toast.error(requestError.message || 'That action failed.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const setAppPermission = async (value) => {
    setBusy('permissions');
    try {
      await api.patch(`/api/admin/users/${encodeURIComponent(userId)}/permissions`, {
        canManageApps: value,
      });
      toast.success('Permissions updated.');
      await load();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not update permissions.');
    } finally {
      setBusy(null);
    }
  };

  const deleteUser = async () => {
    setBusy('delete');
    try {
      await api.del(`/api/admin/users/${encodeURIComponent(userId)}`, {
        confirmUsername: deleteConfirm,
      });
      toast.success('Account deleted.');
      navigate('/admin/users', { replace: true });
    } catch (requestError) {
      toast.error(requestError.message || 'Could not delete the account.');
      setBusy(null);
    }
  };

  if (error) {
    return (
      <Card>
        <EmptyState
          title="Something went wrong"
          description={error}
          action={
            <Button as={Link} to="/admin/users" variant="secondary">
              Back to users
            </Button>
          }
        />
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-56 w-full rounded-[var(--radius-card)]" />
      </div>
    );
  }

  const { user, sessions, ownedApps, consents, roles } = data;

  return (
    <div className="space-y-4 lg:space-y-5">
      <Button as={Link} to="/admin/users" variant="ghost" size="sm">
        <IconBack size={16} />
        All users
      </Button>

      {/* Identity ------------------------------------------------------------ */}
      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-cyan text-lg font-semibold text-white">
            {initial(user.firstName || user.username)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">
              {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.username}
            </h2>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {user.isAdmin && <Badge tone="danger">Administrator</Badge>}
              {user.banned && <Badge tone="danger">Suspended</Badge>}
              <Badge tone={user.emailVerified ? 'positive' : 'warning'}>
                {user.emailVerified ? 'Email verified' : 'Email unverified'}
              </Badge>
              <Badge tone="neutral">{user.identityProvider}</Badge>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={user.isAdmin}
            onClick={() => setEditOpen(true)}
          >
            <IconEdit size={15} />
            Edit details
          </Button>
        </CardBody>

        <CardBody className="grid grid-cols-1 gap-4 border-t border-hairline sm:grid-cols-2">
          <CopyField label="User ID" value={user.userId} />
          <CopyField label="Username" value={user.username} mono={false} />
          <div>
            <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">Joined</p>
            <p className="mt-1 text-sm">{formatDate(user.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">Security</p>
            <div className="mt-1 flex flex-col gap-1">
              <StatusDot active={user.mfaEnabled} className="text-ink-muted">
                Two-factor {user.mfaEnabled ? 'enabled' : 'off'}
              </StatusDot>
              <StatusDot active={user.passkeyEnabled} className="text-ink-muted">
                Passkey {user.passkeyEnabled ? 'registered' : 'none'}
              </StatusDot>
            </div>
          </div>
        </CardBody>

        {user.banned && (
          <CardBody className="border-t border-hairline">
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-3.5">
              <p className="text-sm font-medium text-[#ffa8b2]">Account suspended</p>
              <p className="mt-1 text-xs text-ink-muted">
                {user.bannedReason} · by {user.bannedBy} on {formatDateTime(user.bannedAt)}
              </p>
            </div>
          </CardBody>
        )}
      </Card>

      {/* Permissions --------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Permissions"
          description="What this account is allowed to do beyond signing in."
        />
        <CardBody className="space-y-4">
          <Switch
            label="May manage OIDC applications"
            description="Allows registering and editing OAuth clients and their roles."
            checked={user.canManageApps}
            disabled={busy === 'permissions' || user.appsAllowedForEveryone || user.isAdmin}
            onChange={setAppPermission}
          />

          {user.isAdmin ? (
            <p className="rounded-xl border border-hairline bg-surface px-3.5 py-3 text-xs text-ink-muted">
              Administrators always have application access.
            </p>
          ) : (
            user.appsAllowedForEveryone && (
              <p className="rounded-xl border border-hairline bg-surface px-3.5 py-3 text-xs text-ink-muted">
                Every user currently has application access because it is enabled instance-wide in{' '}
                <Link to="/admin/settings" className="text-accent hover:text-accent-hover">
                  settings
                </Link>
                . Turn that off to control access per user.
              </p>
            )
          )}
        </CardBody>
      </Card>

      {/* Actions ------------------------------------------------------------- */}
      <Card>
        <CardHeader title="Actions" description="Account and support operations." />
        <CardBody className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {user.banned ? (
            <Button
              variant="secondary"
              loading={busy === 'unban'}
              onClick={() => act('unban', '/unban', undefined, 'Account restored.')}
              disabled={user.isAdmin}
            >
              Restore account
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={() => setBanOpen(true)}
              disabled={user.isAdmin}
            >
              Suspend account
            </Button>
          )}

          <Button
            variant="secondary"
            loading={busy === 'sessions'}
            onClick={() =>
              act('sessions', '/revoke-sessions', undefined, 'Signed out everywhere.')
            }
          >
            Sign out everywhere
          </Button>

          <Button
            variant="secondary"
            disabled={!user.mfaEnabled || user.isAdmin}
            onClick={() =>
              setConfirmAction({
                key: 'mfa',
                path: '/reset-mfa',
                title: 'Reset two-factor authentication?',
                description:
                  'The user will be able to sign in with their password alone until they enrol a new authenticator.',
                confirmLabel: 'Reset 2FA',
                message: 'Two-factor authentication reset.',
              })
            }
          >
            Reset two-factor
          </Button>

          <Button
            variant="secondary"
            disabled={!user.passkeyEnabled || user.isAdmin}
            onClick={() =>
              setConfirmAction({
                key: 'passkey',
                path: '/reset-passkey',
                title: 'Remove the passkey?',
                description: 'The user will need their password to sign in until they add a new one.',
                confirmLabel: 'Remove passkey',
                message: 'Passkey removed.',
              })
            }
          >
            Remove passkey
          </Button>

          {!user.emailVerified && (
            <Button
              variant="secondary"
              loading={busy === 'verify'}
              disabled={user.isAdmin}
              onClick={() => act('verify', '/verify-email', undefined, 'Email marked as verified.')}
            >
              Mark email verified
            </Button>
          )}

          <Button
            variant="secondary"
            loading={busy === 'recovery'}
            disabled={user.isAdmin || Boolean(user.passwordRecoveryBlocker)}
            onClick={() =>
              setConfirmAction({
                key: 'recovery',
                path: '/send-recovery',
                destructive: false,
                title: 'Send a password recovery email?',
                description: `${user.email} receives a link that is valid for 30 minutes. Sending it signs the user out of every device.`,
                confirmLabel: 'Send email',
                message: 'Recovery email sent.',
              })
            }
          >
            Send recovery email
          </Button>

          <Button
            variant="outlineDanger"
            disabled={user.isAdmin}
            onClick={() => {
              setDeleteConfirm('');
              setDeleteOpen(true);
            }}
          >
            Delete account
          </Button>
        </CardBody>
        {!user.isAdmin && RECOVERY_BLOCKED_HINT[user.passwordRecoveryBlocker] && (
          <CardBody className="border-t border-hairline pt-3">
            <p className="text-xs text-ink-faint">
              {RECOVERY_BLOCKED_HINT[user.passwordRecoveryBlocker]}
            </p>
          </CardBody>
        )}
        {user.isAdmin && (
          <CardBody className="border-t border-hairline pt-3">
            <p className="text-xs text-ink-faint">
              Administrator accounts cannot be suspended, altered or deleted from this console. Change
              the ADMIN_EMAILS configuration to remove admin rights first.
            </p>
          </CardBody>
        )}
      </Card>

      {/* Sessions ------------------------------------------------------------ */}
      <Card>
        <CardHeader
          title={
            <>
              Active sessions <Badge tone="neutral">{sessions.length}</Badge>
            </>
          }
        />
        <CardBody>
          {sessions.length === 0 ? (
            <p className="text-sm text-ink-muted">No active sessions.</p>
          ) : (
            <ul className="space-y-2.5">
              {sessions.map((session) => (
                <li
                  key={session.sessionId}
                  className="flex items-start gap-3 rounded-xl border border-hairline bg-surface p-3.5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-strong text-ink-muted">
                    <IconDevice size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{session.deviceType}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {session.ipAddr} · started {formatDateTime(session.createdAt)}
                    </p>
                    <p className="truncate font-mono text-[0.68rem] text-ink-faint">
                      {session.sessionId}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Owned apps ---------------------------------------------------------- */}
      <Card>
        <CardHeader
          title={
            <>
              Applications owned <Badge tone="neutral">{ownedApps.length}</Badge>
            </>
          }
          description="OIDC clients registered by this user."
        />
        <CardBody>
          {ownedApps.length === 0 ? (
            <p className="text-sm text-ink-muted">This user has not registered any applications.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ownedApps.map((app) => {
                const appOrigin = originOf(app.redirectUri);
                return (
                  <div
                    key={app.oauthClientAppId}
                    className="flex flex-col rounded-xl border border-hairline bg-surface p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{app.oauthAppName}</p>
                        <p className="truncate font-mono text-[0.7rem] text-ink-faint">
                          {app.clientId}
                        </p>
                      </div>
                      {appOrigin && (
                        <Button
                          as="a"
                          href={appOrigin}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="secondary"
                          size="sm"
                          aria-label={`Open ${app.oauthAppName} at ${appOrigin}`}
                          title={appOrigin}
                        >
                          <IconExternal size={15} />
                        </Button>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={app.isPublicClient ? 'cyan' : 'accent'}>
                        {app.isPublicClient ? 'Public' : 'Confidential'}
                      </Badge>
                      <Badge tone="neutral">{app.accessTokenValidity}s</Badge>
                      {app.disabled && <Badge tone="danger">Disabled</Badge>}
                    </div>

                    {/* Deep-links into the applications console filtered to this
                        client, which is where its full record can be inspected. */}
                    <Button
                      as={Link}
                      to={`/admin/apps?query=${encodeURIComponent(app.clientId)}`}
                      variant="secondary"
                      size="sm"
                      fullWidth
                      className="mt-3"
                    >
                      Open application
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Consents ------------------------------------------------------------ */}
      <Card>
        <CardHeader
          title={
            <>
              Authorized applications <Badge tone="neutral">{consents.length}</Badge>
            </>
          }
          description="Applications this user has granted access to their identity."
        />
        <CardBody>
          {consents.length === 0 ? (
            <p className="text-sm text-ink-muted">No applications authorized.</p>
          ) : (
            <ul className="space-y-2.5">
              {consents.map((consent) => {
                const origin = originOf(consent.redirectUri);
                return (
                  <li
                    key={consent.clientId}
                    className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{consent.appName}</p>
                      <p className="truncate text-xs text-ink-muted">
                        Last used {formatDate(consent.lastAuthAt)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {consent.consentedScopes.map((scope) => (
                          <Badge key={scope} tone="accent">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {origin && (
                        <Button
                          as="a"
                          href={origin}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="secondary"
                          size="sm"
                        >
                          <IconExternal size={15} />
                        </Button>
                      )}
                      <Button
                        variant="outlineDanger"
                        size="sm"
                        onClick={async () => {
                          try {
                            await api.del(
                              `/api/admin/users/${encodeURIComponent(userId)}/consents/${encodeURIComponent(consent.clientId)}`,
                            );
                            toast.success('Consent revoked.');
                            await load();
                          } catch (requestError) {
                            toast.error(requestError.message || 'Could not revoke that consent.');
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {roles.length > 0 && (
        <Card>
          <CardHeader
            title={
              <>
                <IconShield size={18} className="text-accent" />
                Role memberships <Badge tone="neutral">{roles.length}</Badge>
              </>
            }
          />
          <CardBody className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <Badge key={role.oauthRoleId} tone="accent">
                {role.oauthRoleName}
              </Badge>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Dialogs ------------------------------------------------------------- */}
      <EditDetailsModal
        open={editOpen}
        user={user}
        onClose={() => setEditOpen(false)}
        onSaved={async () => {
          await load();
          setEditOpen(false);
        }}
      />

      <Modal
        open={banOpen}
        onClose={() => setBanOpen(false)}
        title="Suspend this account"
        description="The user is signed out of every device immediately and cannot sign in again until restored."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBanOpen(false)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy === 'ban'}
              fullWidth
              className="sm:w-auto"
              onClick={async () => {
                const ok = await act('ban', '/ban', { reason: banReason }, 'Account suspended.');
                if (ok) {
                  setBanOpen(false);
                  setBanReason('');
                }
              }}
            >
              Suspend account
            </Button>
          </>
        }
      >
        <TextArea
          label="Reason (recorded in the audit log)"
          value={banReason}
          onChange={(event) => setBanReason(event.target.value)}
          rows={3}
          className="font-sans text-sm"
          hint="Not shown to the user."
        />
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this account permanently"
        description="This also deletes every application they registered, their roles and their consents. It cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy === 'delete'}
              disabled={deleteConfirm !== user.username}
              fullWidth
              className="sm:w-auto"
              onClick={deleteUser}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <TextInput
          label={`Type "${user.username}" to confirm`}
          value={deleteConfirm}
          onChange={(event) => setDeleteConfirm(event.target.value)}
          autoCapitalize="off"
          autoComplete="off"
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        loading={busy === confirmAction?.key}
        destructive={confirmAction?.destructive !== false}
        title={confirmAction?.title}
        description={confirmAction?.description}
        confirmLabel={confirmAction?.confirmLabel}
        onConfirm={async () => {
          const ok = await act(
            confirmAction.key,
            confirmAction.path,
            undefined,
            confirmAction.message,
          );
          if (ok) setConfirmAction(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** The editable subset of an account, as form values. */
function detailsOf(user) {
  return {
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    username: user.username || '',
    email: user.email || '',
  };
}

/**
 * Correct a user's identity details.
 *
 * Username and email are how a local account signs in, so the dialog says as
 * much rather than presenting them as cosmetic profile fields. A new address is
 * treated as unproven: verification is only carried over when the operator
 * explicitly vouches for it.
 */
function EditDetailsModal({ open, user, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => detailsOf(user));
  const [emailVerified, setEmailVerified] = useState(false);
  const [pending, setPending] = useState(false);

  // Reseed each time the dialog opens, so an abandoned edit is not still
  // sitting in the fields the next time it is opened.
  useEffect(() => {
    if (!open) return;
    setForm(detailsOf(user));
    setEmailVerified(false);
  }, [open, user]);

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const emailChanged =
    form.email.trim().toLowerCase() !== (user.email || '').toLowerCase();
  const usernameChanged = form.username.trim() !== (user.username || '');
  const dirty =
    emailChanged ||
    usernameChanged ||
    form.firstName.trim() !== (user.firstName || '') ||
    form.lastName.trim() !== (user.lastName || '');

  const canSubmit = dirty && form.username.trim() && form.email.trim();

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || pending) return;

    setPending(true);
    try {
      await api.patch(`/api/admin/users/${encodeURIComponent(user.userId)}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        emailVerified,
      });
      toast.success('Details updated.');
      await onSaved();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not update these details.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit details"
      description="Name, username and email address for this account."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            fullWidth
            className="sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            form="admin-edit-user"
            type="submit"
            loading={pending}
            disabled={!canSubmit}
            fullWidth
            className="sm:w-auto"
          >
            Save changes
          </Button>
        </>
      }
    >
      <form id="admin-edit-user" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="First name" value={form.firstName} onChange={update('firstName')} />
          <TextInput label="Last name" value={form.lastName} onChange={update('lastName')} />
        </div>

        <TextInput
          label="Username"
          value={form.username}
          onChange={update('username')}
          hint={
            usernameChanged
              ? 'Changing this changes how the user signs in — tell them.'
              : '3-20 characters: letters, numbers and dashes.'
          }
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
          hint={
            emailChanged
              ? 'Also the sign-in identifier for a local account, and where recovery links are sent.'
              : undefined
          }
          autoCapitalize="off"
          autoComplete="off"
          required
        />

        {emailChanged && (
          <div className="space-y-3 rounded-xl border border-hairline bg-surface p-3.5">
            <Switch
              label="New address is already verified"
              description="Only turn on if you know this address belongs to the user."
              checked={emailVerified}
              onChange={setEmailVerified}
            />
            {!emailVerified && (
              <p className="text-xs text-ink-faint">
                The account will be marked unverified, which blocks password recovery until you mark
                the address verified from the actions below.
              </p>
            )}
          </div>
        )}

        {user.identityProvider !== 'local' && (
          <p className="rounded-xl border border-hairline bg-surface px-3.5 py-3 text-xs text-ink-muted">
            This account signs in through {user.identityProvider}, so these values are only used for
            display and for the claims issued to applications.
          </p>
        )}
      </form>
    </Modal>
  );
}
