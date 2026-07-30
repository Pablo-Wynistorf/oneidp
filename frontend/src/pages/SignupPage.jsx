import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { AuthDivider, SocialAuth } from '@/components/SocialAuth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PasswordInput, TextInput } from '@/components/ui/Field';
import { IconMail } from '@/components/ui/Icons';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useConfig } from '@/config/ConfigProvider';
import { api } from '@/lib/api';
import { leaveTo, readRedirectUri, withRedirectUri } from '@/lib/redirect-uri';

const PASSWORD_RULE =
  'At least 8 characters, with an uppercase and a lowercase letter, a digit and a symbol.';

/** Maps the API's semantic status codes onto a message and the field to clear. */
const SIGNUP_ERRORS = {
  429: { field: null, message: 'Too many attempts. Please wait a moment and try again.' },
  460: { field: 'username', message: 'That username is not valid.' },
  461: { field: 'email', message: 'That email address is not valid.' },
  462: { field: 'password', message: PASSWORD_RULE },
  463: { field: 'email', message: 'That email address is already registered.' },
  464: { field: 'username', message: 'That username is already taken.' },
};

const EMPTY = { firstName: '', lastName: '', email: '', username: '', password: '' };

export function SignupPage() {
  const toast = useToast();
  const config = useConfig();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);

  // null = no invite in the URL, 'checking' | 'invalid' | { email }
  const [invite, setInvite] = useState(inviteToken ? 'checking' : null);

  const redirectUri = readRedirectUri();
  const canSubmit = Object.values(form).every((value) => value.trim() !== '');

  // Validate the invitation and lock the email field to the invited address.
  useEffect(() => {
    if (!inviteToken) return undefined;

    let active = true;
    api
      .get(`/api/auth/invitation?token=${encodeURIComponent(inviteToken)}`)
      .then(({ data }) => {
        if (!active) return;
        setInvite({ email: data.email });
        setForm((current) => ({ ...current, email: data.email }));
      })
      .catch(() => {
        if (active) setInvite('invalid');
      });

    return () => {
      active = false;
    };
  }, [inviteToken]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || pending) return;

    setPending(true);
    setErrors({});

    try {
      const { status, data } = await api.post(
        '/api/auth/signup',
        inviteToken ? { ...form, inviteToken } : form,
        { expect: [403, 409, 410, 429, 460, 461, 462, 463, 464] },
      );

      if (status === 200) {
        // An accepted invitation already verified the address and opened a
        // session, so there is no inbox step to send them to.
        if (data?.emailVerified) {
          leaveTo(redirectUri);
          return;
        }
        const email = encodeURIComponent(form.email);
        window.location.assign(withRedirectUri(`/verify?email=${email}`, redirectUri));
        return;
      }

      if (status === 403 || status === 409 || status === 410) {
        toast.error(data?.error || 'Registration is not available.');
        setPending(false);
        return;
      }

      const failure = SIGNUP_ERRORS[status] ?? {
        field: null,
        message: 'Something went wrong. Please try again.',
      };
      toast.error(failure.message);
      if (failure.field) {
        setErrors({ [failure.field]: failure.message });
        setForm((current) => ({ ...current, [failure.field]: '' }));
      }
      setPending(false);
    } catch (error) {
      toast.error(error.message || 'Something went wrong. Please try again.');
      setPending(false);
    }
  };

  // Waiting on the invitation lookup before deciding what to show.
  if (invite === 'checking') {
    return (
      <AuthLayout title="Checking your invitation" width="sm">
        <div className="grid place-items-center py-8">
          <Spinner size={26} className="text-ink-faint" label="Validating invitation" />
        </div>
      </AuthLayout>
    );
  }

  if (invite === 'invalid') {
    return (
      <AuthLayout
        title="Invitation not valid"
        subtitle="This link has expired, was already used, or was revoked."
        width="sm"
      >
        <div className="text-center">
          <p className="text-sm text-ink-muted">
            Ask an administrator to send you a new invitation.
          </p>
          <Button as={Link} to="/login" variant="secondary" fullWidth className="mt-6">
            Back to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // Public signup is closed and no invitation was supplied.
  if (!config.registrationEnabled && !invite) {
    return (
      <AuthLayout
        title="Registration is closed"
        subtitle="New accounts on this instance are created by invitation only."
        width="sm"
      >
        <div className="flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning">
            <IconMail size={26} />
          </span>
          <p className="mt-4 text-sm text-ink-muted text-pretty">
            Ask an administrator to invite you. Once invited you will receive a link to finish
            setting up your account.
          </p>
          <Button
            as={Link}
            to={withRedirectUri('/login', redirectUri)}
            variant="secondary"
            fullWidth
            className="mt-6"
          >
            Back to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={invite ? 'Accept your invitation' : 'Create your account'}
      subtitle={
        invite
          ? 'Choose a username and password to finish setting up your account.'
          : 'One identity for every application you connect.'
      }
      width="lg"
      footer={
        <>
          Already registered?{' '}
          <Link
            to={withRedirectUri('/login', redirectUri)}
            className="font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Sign in
          </Link>
        </>
      }
    >
      {invite && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-positive/30 bg-positive/10 px-3.5 py-3">
          <Badge tone="positive">Invited</Badge>
          <span className="min-w-0 truncate text-sm text-ink-muted">{invite.email}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="First name"
            value={form.firstName}
            onChange={update('firstName')}
            autoComplete="given-name"
            enterKeyHint="next"
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <TextInput
            label="Last name"
            value={form.lastName}
            onChange={update('lastName')}
            autoComplete="family-name"
            enterKeyHint="next"
            required
          />
        </div>

        <TextInput
          label="Email"
          type="email"
          inputMode="email"
          value={form.email}
          onChange={update('email')}
          error={errors.email}
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
          // The invitation is bound to one address, so it cannot be changed.
          readOnly={Boolean(invite)}
          disabled={Boolean(invite)}
          hint={invite ? 'Fixed by your invitation.' : undefined}
        />

        <TextInput
          label="Username"
          value={form.username}
          onChange={update('username')}
          error={errors.username}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
        />

        <PasswordInput
          value={form.password}
          onChange={update('password')}
          error={errors.password}
          hint={PASSWORD_RULE}
          autoComplete="new-password"
          enterKeyHint="go"
          required
        />

        <Button type="submit" fullWidth size="lg" loading={pending} disabled={!canSubmit}>
          {invite ? 'Accept invitation' : 'Create account'}
        </Button>
      </form>

      {/* Social signup would create a brand new account, which an invitation
          flow must not do — it would bypass the invited address. */}
      {config.socialLoginEnabled && !invite && (
        <div className="mt-5 space-y-4">
          <AuthDivider label="or sign up with" />
          <SocialAuth disabled={pending} />
        </div>
      )}
    </AuthLayout>
  );
}
