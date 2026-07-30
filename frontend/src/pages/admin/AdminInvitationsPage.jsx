import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { Switch, TextInput } from '@/components/ui/Field';
import { IconMail, IconPlus } from '@/components/ui/Icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';

const STATUS_TONE = {
  pending: 'accent',
  accepted: 'positive',
  expired: 'warning',
  revoked: 'neutral',
};

export function AdminInvitationsPage() {
  const toast = useToast();
  const [invitations, setInvitations] = useState(null);
  const [error, setError] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/invitations');
      setInvitations(data.invitations ?? []);
      setError(null);
    } catch (requestError) {
      setError(requestError.message || 'Could not load invitations.');
      setInvitations([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resend = async (invitation) => {
    setBusy(invitation.inviteId);
    try {
      await api.post(`/api/admin/invitations/${encodeURIComponent(invitation.inviteId)}/resend`);
      toast.success(`A new invitation was sent to ${invitation.email}.`);
      await load();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not resend the invitation.');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    setBusy(revoking.inviteId);
    try {
      await api.del(`/api/admin/invitations/${encodeURIComponent(revoking.inviteId)}`);
      toast.success('Invitation revoked.');
      setRevoking(null);
      await load();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not revoke the invitation.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title={
            <>
              Invitations
              {invitations && <Badge tone="neutral">{invitations.length}</Badge>}
            </>
          }
          description="Invite people by email. Invitations work even while public registration is closed."
          actions={
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <IconPlus size={16} />
              Invite someone
            </Button>
          }
        />
        <CardBody>
          {invitations === null ? (
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-xl sm:h-16" />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Something went wrong" description={error} />
          ) : invitations.length === 0 ? (
            <EmptyState
              icon={<IconMail size={22} />}
              title="No invitations yet"
              description="Invite a user to create an account without opening public registration."
              action={
                <Button onClick={() => setInviteOpen(true)}>
                  <IconPlus size={17} />
                  Invite someone
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {invitations.map((invitation) => (
                <li
                  key={invitation.inviteId}
                  className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{invitation.email}</p>
                    <p className="truncate text-xs text-ink-muted">
                      Invited by {invitation.invitedBy} · {formatDate(invitation.createdAt)}
                    </p>
                    <p className="truncate text-xs text-ink-faint">
                      {invitation.status === 'accepted'
                        ? `Accepted ${formatDateTime(invitation.acceptedAt)}`
                        : `Expires ${formatDateTime(invitation.expiresAt)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {invitation.canManageApps && <Badge tone="cyan">App manager</Badge>}
                    <Badge tone={STATUS_TONE[invitation.status]}>{invitation.status}</Badge>
                    {invitation.status !== 'accepted' && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busy === invitation.inviteId}
                          onClick={() => resend(invitation)}
                        >
                          Resend
                        </Button>
                        {invitation.status === 'pending' && (
                          <Button
                            variant="outlineDanger"
                            size="sm"
                            onClick={() => setRevoking(invitation)}
                          >
                            Revoke
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSent={async (email) => {
          toast.success(`Invitation sent to ${email}.`);
          await load();
        }}
      />

      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={revoke}
        loading={busy === revoking?.inviteId}
        destructive
        title="Revoke this invitation?"
        description={`The link sent to ${revoking?.email ?? 'this address'} will stop working.`}
        confirmLabel="Revoke invitation"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function InviteModal({ open, onClose, onSent }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [canManageApps, setCanManageApps] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail('');
      setCanManageApps(false);
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || pending) return;

    setPending(true);
    try {
      await api.post('/api/admin/invitations', { email: email.trim(), canManageApps });
      await onSent(email.trim());
      onClose();
    } catch (requestError) {
      toast.error(requestError.message || 'Could not send the invitation.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a user"
      description="They receive a one-time link that expires in 7 days. Accepting it verifies their email automatically."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button
            form="admin-invite"
            type="submit"
            loading={pending}
            disabled={!email.trim()}
            fullWidth
            className="sm:w-auto"
          >
            Send invitation
          </Button>
        </>
      }
    >
      <form id="admin-invite" onSubmit={submit} className="space-y-4" noValidate>
        <TextInput
          label="Email address"
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <div className="rounded-xl border border-hairline bg-surface p-3.5">
          <Switch
            label="May manage OIDC applications"
            description="Leave off unless this person needs to register their own OAuth clients."
            checked={canManageApps}
            onChange={setCanManageApps}
          />
        </div>
      </form>
    </Modal>
  );
}
