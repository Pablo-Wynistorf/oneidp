import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { withRedirectUri, readRedirectUri } from '@/lib/redirect-uri';
import { useSession } from '@/session/SessionProvider';

const PASSWORD_RULE =
  'At least 8 characters, with an uppercase and a lowercase letter, a digit and a symbol.';

/**
 * Final step of password recovery.
 *
 * Authorisation comes from the httpOnly `password_reset_token` cookie that the
 * API set when the emailed link was opened, so no token is handled here.
 */
export function SetPasswordPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { clear } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const redirectUri = readRedirectUri();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password || pending) return;

    setPending(true);
    setError(null);

    try {
      const { status } = await api.post(
        '/api/auth/user/setpassword',
        { password },
        { expect: [460, 461] },
      );

      if (status === 200) {
        // Recovery does not sign anyone in: the new password has to be used
        // once. `clear()` drops any stale authenticated state so the
        // signed-out-only /login route does not bounce back to the dashboard,
        // and a client-side navigation keeps the confirmation toast on screen.
        clear();
        toast.success('Password updated. Sign in with your new password.');
        navigate(withRedirectUri('/login', redirectUri), { replace: true });
        return;
      }

      if (status === 460) {
        setError(PASSWORD_RULE);
        setPassword('');
        setPending(false);
        return;
      }

      // 461: the reset token expired or was already used.
      toast.error('This reset link is no longer valid. Please request a new one.');
      setTimeout(() => window.location.assign('/recovery'), 1500);
    } catch (requestError) {
      toast.error(requestError.message || 'Something went wrong. Please try again.');
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you have not used here before."
      width="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <PasswordInput
          label="New password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          error={error}
          hint={PASSWORD_RULE}
          autoComplete="new-password"
          enterKeyHint="go"
          required
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <Button type="submit" fullWidth size="lg" loading={pending} disabled={!password}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
