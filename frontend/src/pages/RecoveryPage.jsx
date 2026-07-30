import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { IconMail } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { readRedirectUri, withRedirectUri } from '@/lib/redirect-uri';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

export function RecoveryPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const redirectUri = readRedirectUri();

  const isValid = EMAIL_PATTERN.test(email);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const sendLink = async () => {
    if (!isValid || pending) return;
    setPending(true);
    try {
      await api.post('/api/auth/user/resetpassword', { email });
      setSent(true);
      setSecondsLeft(RESEND_SECONDS);
    } catch (error) {
      toast.error(error.message || 'Could not send the reset link. Please try again.');
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" subtitle="A password reset link is on its way." width="sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
            <IconMail size={26} />
          </span>

          <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-sm font-medium break-all text-ink">
            {email}
          </p>
          <p className="mt-4 text-sm text-ink-muted text-pretty">
            The link is valid for 30 minutes. Check your spam folder if it does not arrive.
          </p>

          <div className="mt-6 grid w-full gap-2.5">
            <Button onClick={sendLink} loading={pending} disabled={secondsLeft > 0} fullWidth>
              {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend link'}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setSent(false);
                setEmail('');
                setSecondsLeft(0);
              }}
            >
              Use a different address
            </Button>
            <Button
              as={Link}
              to={withRedirectUri('/login', redirectUri)}
              variant="ghost"
              fullWidth
            >
              Back to sign in
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email on your account and we will send you a reset link."
      width="sm"
      footer={
        <>
          Remembered it?{' '}
          <Link
            to={withRedirectUri('/login', redirectUri)}
            className="font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendLink();
        }}
        className="space-y-4"
        noValidate
      >
        <TextInput
          label="Email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          required
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <Button type="submit" fullWidth size="lg" loading={pending} disabled={!isValid}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
