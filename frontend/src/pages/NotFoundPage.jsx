import { Link } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="text-center">
        <Brand size="lg" className="mb-8" />
        <p className="font-mono text-sm tracking-widest text-ink-faint">404</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Page not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted text-pretty">
          The page you were looking for does not exist or has moved.
        </p>
        <Button as={Link} to="/" className="mt-7">
          Back to home
        </Button>
      </div>
    </div>
  );
}
