import { useCallback, useState } from 'react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { CodeInput } from '@/components/ui/CodeInput';
import { Button } from '@/components/ui/Button';
import { IconShield } from '@/components/ui/Icons';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { leaveTo, readRedirectUri } from '@/lib/redirect-uri';

/** Second factor prompt shown after a password login returns 463. */
export function MfaPage() {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const redirectUri = readRedirectUri();

  const submit = useCallback(
    async (value) => {
      if (pending) return;
      setPending(true);
      setError(null);

      try {
        const { status } = await api.post(
          '/api/auth/mfa/verify',
          { mfaVerifyCode: value },
          { expect: [460, 461, 462] },
        );

        if (status === 200) {
          leaveTo(redirectUri);
          return;
        }

        if (status === 460) {
          toast.info('Multi-factor authentication is not enabled on this account.');
          setTimeout(() => window.location.assign('/dashboard'), 1500);
          return;
        }

        if (status === 462) {
          toast.error('Your sign-in session expired. Please start again.');
          setTimeout(() => window.location.assign('/login'), 1500);
          return;
        }

        setError('That code is not correct.');
        setCode('');
        setPending(false);
      } catch (requestError) {
        toast.error(requestError.message || 'Something went wrong. Please try again.');
        setCode('');
        setPending(false);
      }
    },
    [pending, redirectUri, toast],
  );

  return (
    <AuthLayout
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app."
      width="sm"
    >
      <div className="flex flex-col items-center">
        <span className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <IconShield size={26} />
        </span>

        <div className="w-full">
          <CodeInput
            value={code}
            onChange={(value) => {
              setCode(value);
              setError(null);
            }}
            onComplete={submit}
            disabled={pending}
            error={error}
            autoFocus
            label="Authentication code"
          />
        </div>

        <Button
          fullWidth
          size="lg"
          className="mt-5"
          loading={pending}
          disabled={code.length !== 6}
          onClick={() => submit(code)}
        >
          Verify
        </Button>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Codes refresh every 30 seconds. If yours keeps failing, check that your device clock is
          accurate.
        </p>
      </div>
    </AuthLayout>
  );
}
