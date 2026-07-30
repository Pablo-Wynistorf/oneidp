import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { Switch, TextInput } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

/**
 * Instance-wide settings.
 *
 * Toggles save immediately — a switch that needs a separate "save" is easy to
 * leave half-applied, and these are single booleans. The text fields are
 * committed explicitly instead, since they are edited character by character.
 */
export function AdminSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);
  const [domains, setDomains] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .get('/api/admin/settings')
      .then(({ data }) => {
        setSettings(data.settings);
        setDomains((data.settings.allowedEmailDomains ?? []).join(', '));
        setMessage(data.settings.maintenanceMessage ?? '');
      })
      .catch((requestError) => setError(requestError.message || 'Could not load settings.'));
  }, []);

  const patch = async (key, body, successMessage) => {
    setSaving(key);
    try {
      const { data } = await api.patch('/api/admin/settings', body);
      setSettings(data.settings);
      toast.success(successMessage);
    } catch (requestError) {
      toast.error(requestError.message || 'Could not save that setting.');
    } finally {
      setSaving(null);
    }
  };

  if (error) {
    return (
      <Card>
        <EmptyState title="Something went wrong" description={error} />
      </Card>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 lg:space-y-5">
        <Card>
          <CardHeader
            title="Access"
            description="Who can get an account and how they sign in."
          />
          <CardBody className="space-y-5">
            <Switch
              label="Public registration"
              description="When off, the signup form is closed and only invited people can create an account."
              checked={settings.registrationEnabled}
              disabled={saving === 'registrationEnabled'}
              onChange={(value) =>
                patch(
                  'registrationEnabled',
                  { registrationEnabled: value },
                  value ? 'Registration opened.' : 'Registration closed.',
                )
              }
            />
            <Switch
              label="Google and GitHub sign-in"
              description="Turn off to require username and password (or passkeys) only."
              checked={settings.socialLoginEnabled}
              disabled={saving === 'socialLoginEnabled'}
              onChange={(value) =>
                patch('socialLoginEnabled', { socialLoginEnabled: value }, 'Saved.')
              }
            />
            <Switch
              label="Self-service password reset"
              description="Turn off if password changes must go through an administrator."
              checked={settings.passwordResetEnabled}
              disabled={saving === 'passwordResetEnabled'}
              onChange={(value) =>
                patch('passwordResetEnabled', { passwordResetEnabled: value }, 'Saved.')
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="OIDC applications"
            description="Who may register and manage OAuth clients."
          />
          <CardBody className="space-y-5">
            <Switch
              label="Everyone may manage applications"
              description="Off by default. When on, every signed-in user can register and manage OAuth clients. When off, only users you grant access to individually can."
              checked={settings.allowAllUsersManageApps}
              disabled={saving === 'allowAllUsersManageApps'}
              onChange={(value) =>
                patch(
                  'allowAllUsersManageApps',
                  { allowAllUsersManageApps: value },
                  value ? 'Everyone can now manage applications.' : 'Restricted to granted users.',
                )
              }
            />

            {!settings.allowAllUsersManageApps && (
              <p className="rounded-xl border border-hairline bg-surface px-3.5 py-3 text-xs text-ink-muted">
                Grant access to individual people from{' '}
                <Link to="/admin/users" className="text-accent hover:text-accent-hover">
                  a user&rsquo;s page
                </Link>
                . Turning this switch on later overrides those grants; turning it back off restores
                them.
              </p>
            )}

            <Switch
              label="Allow creating new applications"
              description="Separate kill switch. When off, nobody can register a new client even if they are otherwise permitted to manage existing ones."
              checked={settings.appCreationEnabled}
              disabled={saving === 'appCreationEnabled'}
              onChange={(value) =>
                patch('appCreationEnabled', { appCreationEnabled: value }, 'Saved.')
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Signup restrictions"
            description="Applied to public signups. Invitations bypass this."
          />
          <CardBody>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <TextInput
                label="Allowed email domains"
                value={domains}
                onChange={(event) => setDomains(event.target.value)}
                placeholder="example.com, example.org"
                hint="Comma separated. Leave empty to allow any domain."
                containerClassName="flex-1"
                autoCapitalize="off"
                spellCheck={false}
              />
              <Button
                variant="secondary"
                loading={saving === 'allowedEmailDomains'}
                onClick={() =>
                  patch('allowedEmailDomains', { allowedEmailDomains: domains }, 'Domains saved.')
                }
              >
                Save
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Maintenance mode"
            description="Blocks sign-in for everyone except administrators."
          />
          <CardBody className="space-y-4">
            <Switch
              label="Maintenance mode"
              description="Existing sessions keep working; only new sign-ins are refused."
              checked={settings.maintenanceMode}
              disabled={saving === 'maintenanceMode'}
              onChange={(value) =>
                patch(
                  'maintenanceMode',
                  { maintenanceMode: value },
                  value ? 'Maintenance mode on.' : 'Maintenance mode off.',
                )
              }
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <TextInput
                label="Message shown to users"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="We are back shortly."
                containerClassName="flex-1"
              />
              <Button
                variant="secondary"
                loading={saving === 'maintenanceMessage'}
                onClick={() =>
                  patch('maintenanceMessage', { maintenanceMessage: message }, 'Message saved.')
                }
              >
                Save
              </Button>
            </div>
          </CardBody>
        </Card>

        {settings.updatedAt && (
          <p className="text-xs text-ink-faint">
            Last changed {formatDateTime(settings.updatedAt)}
            {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}.
          </p>
        )}
      </div>
    </>
  );
}
