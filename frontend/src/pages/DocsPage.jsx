import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { Markdown } from '@/components/Markdown';
import { Button, IconButton } from '@/components/ui/Button';
import {
  IconBack,
  IconBook,
  IconChevronDown,
  IconClose,
  IconGitHub,
  IconMenu,
} from '@/components/ui/Icons';
import { DOCS, getDoc, getDocNeighbours } from '@/lib/docs';
import { cn } from '@/lib/cn';
import { useSession } from '@/session/SessionProvider';

const REPO_URL = 'https://github.com/Pablo-Wynistorf/oneidp';
const REPO_DOCS_URL = `${REPO_URL}/tree/main/docs`;

/** Sidebar entry. `end` keeps `/docs` from matching every child route. */
function PageLink({ page, onNavigate }) {
  return (
    <NavLink
      to={page.path}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'block rounded-xl px-3 py-2 text-sm transition-colors tap-target',
          isActive
            ? 'bg-accent/15 font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-accent-soft)]'
            : 'text-ink-muted hover:bg-surface hover:text-ink',
        )
      }
    >
      {page.nav}
    </NavLink>
  );
}

function PageNav({ onNavigate, className }) {
  return (
    <nav className={cn('space-y-1', className)} aria-label="Documentation">
      <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
        Integration docs
      </p>
      {DOCS.map((page) => (
        <PageLink key={page.slug} page={page} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

/** In-page table of contents, built from the document's `##` headings. */
function OnThisPage({ headings, onNavigate, className }) {
  if (headings.length === 0) return null;

  return (
    <nav className={className} aria-label="On this page">
      <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
        On this page
      </p>
      <ul className="space-y-0.5">
        {headings.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              onClick={onNavigate}
              className="block rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The SPA owns the URL, so the browser never jumps to a `#section` on its own.
 * Scroll to the anchor when one is present, and back to the top when the
 * reader moves to a different document.
 */
function useAnchorScroll(slug, hash) {
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return undefined;
    }

    const id = decodeURIComponent(hash.slice(1));
    // A frame's grace so the freshly rendered markdown is in the DOM.
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [slug, hash]);
}

function DocsHeader({ menuOpen, onToggleMenu }) {
  const { isAuthenticated } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" aria-label="ONEIDP home" className="rounded-lg">
            <Brand size="sm" />
          </Link>
          <span aria-hidden className="hidden h-5 w-px bg-hairline sm:block" />
          <Link
            to="/docs"
            className="hidden items-center gap-1.5 rounded-lg text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:inline-flex"
          >
            <IconBook size={16} />
            Docs
          </Link>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink sm:inline-flex"
          >
            <IconGitHub size={16} />
            GitHub
          </a>
          <Button as={Link} to="/" variant="ghost" size="sm" className="hidden sm:inline-flex">
            <IconBack size={16} />
            Home
          </Button>
          {isAuthenticated ? (
            <Button as={Link} to="/dashboard" size="sm">
              Dashboard
            </Button>
          ) : (
            <Button as={Link} to="/login" size="sm">
              Sign in
            </Button>
          )}
          <IconButton
            label={menuOpen ? 'Close documentation menu' : 'Open documentation menu'}
            onClick={onToggleMenu}
            aria-expanded={menuOpen}
            className="lg:hidden"
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </IconButton>
        </div>
      </div>
    </header>
  );
}

/** Previous/next pair so the docs can be read straight through. */
function DocFooterNav({ slug }) {
  const { previous, next } = getDocNeighbours(slug);
  if (!previous && !next) return null;

  return (
    <nav
      className="mt-14 grid grid-cols-1 gap-3 border-t border-hairline pt-6 sm:grid-cols-2"
      aria-label="Pagination"
    >
      {previous ? (
        <Link
          to={previous.path}
          className="group rounded-2xl border border-hairline bg-surface p-4 transition-colors hover:border-hairline-strong"
        >
          <span className="text-xs text-ink-faint">Previous</span>
          <span className="mt-1 block text-sm font-medium text-ink">{previous.nav}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          to={next.path}
          className="group rounded-2xl border border-hairline bg-surface p-4 text-right transition-colors hover:border-hairline-strong sm:col-start-2"
        >
          <span className="text-xs text-ink-faint">Next</span>
          <span className="mt-1 block text-sm font-medium text-ink">{next.nav}</span>
        </Link>
      )}
    </nav>
  );
}

function UnknownDoc() {
  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-6 sm:p-8">
      <h1 className="text-xl font-semibold sm:text-2xl">That page is not in the docs</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Pick a document from the list, or start with the overview.
      </p>
      <Button as={Link} to="/docs" className="mt-6">
        <IconBook size={17} />
        Docs overview
      </Button>
    </div>
  );
}

/**
 * `/docs` and `/docs/:slug`.
 *
 * Content comes straight from the markdown in the repository's `/docs` folder,
 * so this route and the files a contributor reads on GitHub never drift apart.
 */
export function DocsPage() {
  const { slug = 'index' } = useParams();
  const { hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const page = getDoc(slug);

  useAnchorScroll(slug, hash);

  // The drawer is a navigation aid, not a place to stay: close it on a move.
  useEffect(() => setMenuOpen(false), [slug]);

  return (
    <div className="min-h-dvh">
      <DocsHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />

      {menuOpen && (
        <div className="border-b border-hairline bg-canvas-raised/95 backdrop-blur-xl lg:hidden">
          <div className="mx-auto max-w-7xl px-3 py-3">
            <PageNav onNavigate={() => setMenuOpen(false)} />
            {page && (
              <OnThisPage
                headings={page.headings}
                onNavigate={() => setMenuOpen(false)}
                className="mt-4 border-t border-hairline pt-3"
              />
            )}
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl gap-10 px-5 sm:px-6">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto py-8 lg:block">
          <PageNav />
          <a
            href={REPO_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-faint transition-colors hover:bg-surface hover:text-ink"
          >
            <IconGitHub size={16} />
            Edit on GitHub
          </a>
        </aside>

        <main
          id="main"
          className="min-w-0 flex-1 py-8 pb-[calc(env(safe-area-inset-bottom)+4rem)] sm:py-10"
        >
          {page ? (
            <article className="max-w-3xl">
              <p className="text-xs font-medium tracking-[0.16em] text-accent uppercase">
                Integration docs
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {page.title}
              </h1>
              <p className="mt-3 text-ink-muted text-pretty">{page.summary}</p>

              {/* The desktop TOC lives in the right rail; on tablet widths it
                  collapses into a details element above the content. */}
              {page.headings.length > 0 && (
                <details className="group mt-7 rounded-2xl border border-hairline bg-surface px-4 py-3 xl:hidden">
                  <summary className="flex items-center justify-between gap-2 text-sm font-medium text-ink">
                    On this page
                    <IconChevronDown
                      size={16}
                      className="text-ink-faint transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <ul className="mt-2 space-y-0.5">
                    {page.headings.map((entry) => (
                      <li key={entry.id}>
                        <a
                          href={`#${entry.id}`}
                          className="block rounded-lg py-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
                        >
                          {entry.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <Markdown className="mt-8">{page.body}</Markdown>

              <DocFooterNav slug={page.slug} />
            </article>
          ) : (
            <UnknownDoc />
          )}
        </main>

        {page && (
          <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto py-8 xl:block">
            <OnThisPage headings={page.headings} />
          </aside>
        )}
      </div>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-5 py-7 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] text-sm text-ink-faint sm:flex-row sm:justify-between sm:px-6">
          <Brand size="sm" />
          <nav className="flex items-center gap-5" aria-label="Legal">
            <Link to="/privacy-policy" className="rounded transition-colors hover:text-ink-muted">
              Privacy
            </Link>
            <Link to="/imprint" className="rounded transition-colors hover:text-ink-muted">
              Imprint
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded transition-colors hover:text-ink-muted"
            >
              <IconGitHub size={15} />
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
