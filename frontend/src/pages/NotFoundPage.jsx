import { Link } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { DocsLink } from '@/components/DocsLink';
import { Button } from '@/components/ui/Button';
import { IconBook } from '@/components/ui/Icons';

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
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button as={Link} to="/">
            Back to home
          </Button>
          <Button as={DocsLink} to="/docs" variant="secondary">
            <IconBook size={17} />
            Integration docs
          </Button>
        </div>
      </div>
    </div>
  );
}
