import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/layouts/AppLayout';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { CodeInput } from '@/components/ui/CodeInput';
import { CopyButton } from '@/components/ui/CopyField';
import { HiddenUsername, PasswordInput } from '@/components/ui/Field';
import { IconDevice, IconKey, IconLogout, IconShield } from '@/components/ui/Icons';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Skeleton, Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api, SessionExpiredError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { createCredential, describePasskeyError, isPasskeySupported } from '@/lib/webauthn';
import { useSession } from '@/session/SessionProvider';

const PASSWORD_RULE =
  'At least 8 characters, with an uppercase and a lowercase letter, a digit and a symbol.';

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage how you sign in and which devices have access."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <MfaCard />
        <PasskeyCard />
        <PasswordCard />
        <SessionsCard className="lg:col-span-2" />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function MfaCard() {
  const toast = useToast();
  const { user, refresh } = useSession();
  const enabled = Boolean(user?.mfaEnabled);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const openSetup = async () => {
    setSetupOpen(true);
    setSetup(null);
    setCode('');
    setCodeError(null);
    try {
      const { data } = await api.post('/api/auth/mfa/setup');
      if (data?.success) {
        setSetup({ imageUrl: data.imageUrl, activationCode: data.mfaActivationCode });
      } else {
        throw new Error('Could not start MFA setup');
      }
    } catch (error) {
      toast.error(error.message || 'Could not start MFA setup.');
      setSetupOpen(false);
    }
  };

  const verify = useCallback(
    async (value) => {
      setVerifying(true);
      setCodeError(null);
      try {
        await api.post('/api/auth/mfa/setup/verify', { mfaVerifyCode: value });
        toast.success('Two-factor authentication is now enabled.');
        setSetupOpen(false);
        await refresh();
      } catch {
        setCodeError('That code is not correct.');
        setCode('');
      } finally {
        setVerifying(false);
      }
    },
    [refresh, toast],
  );

  const disable = async () => {
    setDisabling(true);
    try {
      await api.post('/api/auth/mfa/disable');
      toast.success('Two-factor authentication disabled.');
      setDisableOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not disable two-factor authentication.');
    } finally {
      setDisabling(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title={
            <>
              <IconShield size={18} className="text-accent" />
              Two-factor authentication
              <Badge tone={enabled ? 'positive' : 'neutral'}>
                {enabled ? 'Enabled' : 'Off'}
              </Badge>
            </>
          }
          description="Require a time-based code from your authenticator app at sign-in."
        />
        <CardBody>
          {enabled ? (
            <Button variant="outlineDanger" fullWidth onClick={() => setDisableOpen(true)}>
              Disable two-factor authentication
            </Button>
          ) : (
            <Button fullWidth onClick={openSetup}>
              Enable two-factor authentication
            </Button>
          )}
        </CardBody>
      </Card>

      <Modal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="Set up two-factor authentication"
        description="Scan the QR code with your authenticator app, then enter the 6-digit code."
      >
        <div className="space-y-5">
          <div className="flex justify-center">
            {setup ? (
              <img
                src={setup.imageUrl}
                alt="QR code for setting up two-factor authentication"
                width={200}
                height={200}
                className="size-50 rounded-xl bg-white p-2"
              />
            ) : (
              <div className="grid size-50 place-items-center rounded-xl bg-surface">
                <Spinner size={26} className="text-ink-faint" label="Generating QR code" />
              </div>
            )}
          </div>

          {setup?.activationCode && (
            <div className="rounded-xl border border-hairline bg-surface p-3">
              <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                Or enter this key manually
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                  {setup.activationCode}
                </code>
                <CopyButton value={setup.activationCode} label="Copy setup key" />
              </div>
            </div>
          )}

          <CodeInput
            value={code}
            onChange={(value) => {
              setCode(value);
              setCodeError(null);
            }}
            onComplete={verify}
            disabled={!setup || verifying}
            error={codeError}
            label="Verification code from your authenticator app"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        onConfirm={disable}
        loading={disabling}
        destructive
        title="Disable two-factor authentication?"
        description="Your account will be protected by your password alone. You can re-enable this at any time."
        confirmLabel="Disable"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function PasskeyCard() {
  const toast = useToast();
  const { user, refresh } = useSession();
  const enabled = Boolean(user?.passkeyEnabled);
  const supported = isPasskeySupported();

  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const register = async () => {
    setPending(true);
    try {
      const { data: options } = await api.post('/api/auth/passkey/setup/generate');
      const credential = await createCredential(options);
      const { data } = await api.post('/api/auth/passkey/setup/verify', {
        response: credential,
      });

      if (data?.success) {
        toast.success('Passkey registered.');
        await refresh();
      } else {
        toast.error(data?.error || 'Passkey registration failed.');
      }
    } catch (error) {
      toast.error(describePasskeyError(error));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.post('/api/auth/passkey/delete');
      toast.success('Passkey deleted.');
      setDeleteOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not delete the passkey.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title={
            <>
              <IconKey size={18} className="text-accent" />
              Passkey
              <Badge tone={enabled ? 'positive' : 'neutral'}>
                {enabled ? 'Registered' : 'Off'}
              </Badge>
            </>
          }
          description="Sign in with Face ID, Touch ID, Windows Hello or a security key."
        />
        <CardBody className="space-y-3">
          {!supported ? (
            <p className="text-sm text-ink-muted">
              This browser does not support passkeys.
            </p>
          ) : enabled ? (
            <Button variant="outlineDanger" fullWidth onClick={() => setDeleteOpen(true)}>
              Delete passkey
            </Button>
          ) : (
            <Button fullWidth onClick={register} loading={pending}>
              Add a passkey
            </Button>
          )}
          <p className="text-xs text-ink-faint">
            One passkey per account is supported. Adding a new one replaces the old.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        loading={deleting}
        destructive
        title="Delete your passkey?"
        description="You will need your password to sign in until you register a new passkey."
        confirmLabel="Delete passkey"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function PasswordCard() {
  const toast = useToast();
  const { user } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);

  const canSubmit = currentPassword !== '' && newPassword !== '';

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || pending) return;

    setPending(true);
    setErrors({});

    try {
      const { status } = await api.post(
        '/api/auth/user/changepassword',
        { currentPassword, newPassword },
        { expect: [460, 461] },
      );

      if (status === 200) {
        toast.success('Password changed.');
        setCurrentPassword('');
        setNewPassword('');
      } else if (status === 460) {
        setErrors({ newPassword: PASSWORD_RULE });
      } else {
        setErrors({ currentPassword: 'That is not your current password.' });
      }
    } catch (error) {
      toast.error(error.message || 'Could not change your password.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Password" description="Change the password used to sign in." />
      <CardBody>
        <form
          id="change-password-form"
          data-form-type="change_password"
          onSubmit={submit}
          className="space-y-4"
          aria-label="Change password"
          noValidate
        >
          <HiddenUsername value={user?.username || user?.email} />
          <PasswordInput
            label="Current password"
            id="current-password"
            name="currentPassword"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            error={errors.currentPassword}
            autoComplete="current-password"
            data-form-type="password"
            required
          />
          <PasswordInput
            label="New password"
            id="new-password"
            name="newPassword"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={errors.newPassword}
            hint={PASSWORD_RULE}
            autoComplete="new-password"
            data-form-type="password,new"
            required
          />
          <Button
            type="submit"
            fullWidth
            loading={pending}
            disabled={!canSubmit}
            data-form-type="action,change_password"
          >
            Change password
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function SessionsCard({ className }) {
  const toast = useToast();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(null);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [logoutAllPending, setLogoutAllPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/user/session');
      if (data?.success && data.sessions) {
        setSessions(data.sessions);
        setError(null);
      } else {
        throw new Error('Unexpected response');
      }
    } catch (requestError) {
      if (requestError instanceof SessionExpiredError) return;
      setSessions([]);
      setError('Could not load your active sessions.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const endSession = async (sessionId) => {
    setSigningOut(sessionId);
    try {
      const { data } = await api.del('/api/auth/user/session', { sessionId });
      if (data?.success && data.sessions) {
        setSessions(data.sessions);
        toast.success('Session signed out.');
      } else {
        throw new Error('Unexpected response');
      }
    } catch (requestError) {
      toast.error(requestError.message || 'Could not sign out that session.');
    } finally {
      setSigningOut(null);
    }
  };

  const logoutEverywhere = async () => {
    setLogoutAllPending(true);
    try {
      await api.post('/api/auth/logoutall');
      window.location.assign('/login');
    } catch (requestError) {
      toast.error(requestError.message || 'Could not sign out everywhere.');
      setLogoutAllPending(false);
    }
  };

  return (
    <>
      <Card className={className}>
        <CardHeader
          title={
            <>
              Active sessions
              {sessions && <Badge tone="neutral">{sessions.length}</Badge>}
            </>
          }
          description="Devices currently signed in to your account."
          actions={
            <Button variant="outlineDanger" size="sm" onClick={() => setLogoutAllOpen(true)}>
              <IconLogout size={16} />
              Sign out everywhere
            </Button>
          }
        />
        <CardBody>
          {sessions === null ? (
            <div className="space-y-2.5">
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-xl sm:h-16" />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Something went wrong" description={error} />
          ) : sessions.length === 0 ? (
            <EmptyState icon={<IconDevice size={22} />} title="No active sessions" />
          ) : (
            <ul className="space-y-2.5">
              {sessions.map((session) => {
                // The API reports currentSession as the string "false" for
                // other devices, so compare against that rather than a boolean.
                const isCurrent = session.currentSession !== 'false';
                return (
                  <li
                    key={session.sessionId}
                    className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-strong text-ink-muted">
                        <IconDevice size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {session.sessionData?.deviceType || 'Unknown device'}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {session.sessionData?.ipAddr} ·{' '}
                          {formatDateTime(Number(session.sessionData?.createdAt))}
                        </p>
                        <p
                          className="truncate font-mono text-[0.68rem] text-ink-faint"
                          title={session.sessionId}
                        >
                          {session.sessionId}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 self-end sm:self-auto">
                      {isCurrent ? (
                        <Badge tone="positive">This device</Badge>
                      ) : (
                        <IconButton
                          label={`Sign out session ${session.sessionId}`}
                          variant="secondary"
                          loading={signingOut === session.sessionId}
                          onClick={() => endSession(session.sessionId)}
                        >
                          <IconLogout size={17} />
                        </IconButton>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={logoutAllOpen}
        onClose={() => setLogoutAllOpen(false)}
        onConfirm={logoutEverywhere}
        loading={logoutAllPending}
        destructive
        title="Sign out everywhere?"
        description="Every device, including this one, will be signed out and you will need to sign in again."
        confirmLabel="Sign out everywhere"
      />
    </>
  );
}
