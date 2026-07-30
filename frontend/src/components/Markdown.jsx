import { Children, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IconCheck, IconCopy, IconExternal } from '@/components/ui/Icons';
import { resolveDocHref, slugify } from '@/lib/docs';
import { cn } from '@/lib/cn';

const REMARK_PLUGINS = [remarkGfm];

/** Flatten a React subtree back to text, so a heading can derive its anchor. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node.props) return textOf(node.props.children);
  return '';
}

/**
 * Headings carry the anchor the markdown links to, plus a clickable `#` so a
 * reader can grab a deep link. `scroll-mt` keeps the target clear of the
 * sticky header when the browser jumps to it.
 */
function heading(level) {
  const Tag = `h${level}`;
  const styles = {
    2: 'mt-12 mb-4 text-xl font-semibold text-ink sm:text-2xl',
    3: 'mt-9 mb-3 text-base font-semibold text-ink sm:text-lg',
    4: 'mt-7 mb-2 text-sm font-semibold tracking-wide text-ink-muted uppercase',
  }[level];

  return function Heading({ children }) {
    const id = slugify(textOf(children));
    return (
      <Tag id={id} className={cn('group scroll-mt-24', styles)}>
        <a
          href={`#${id}`}
          className="no-underline"
          aria-label={`Link to section: ${textOf(children)}`}
        >
          {children}
          <span
            aria-hidden
            className="ml-2 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
          >
            #
          </span>
        </a>
      </Tag>
    );
  };
}

function MarkdownLink({ href, children }) {
  const target = resolveDocHref(href);

  const className =
    'text-accent underline decoration-accent/35 underline-offset-4 transition-colors hover:text-accent-hover hover:decoration-accent';

  if (target.kind === 'internal') {
    return (
      <Link to={target.href} className={className}>
        {children}
      </Link>
    );
  }

  if (target.kind === 'anchor') {
    return (
      <a href={target.href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <a
      href={target.href}
      target="_blank"
      rel="noreferrer"
      className={cn(className, 'inline-flex items-baseline gap-1')}
    >
      {children}
      <IconExternal size={13} className="translate-y-px self-center" />
    </a>
  );
}

/**
 * Fenced code block, in the same window-chrome frame the landing page uses.
 * The language from the fence becomes the label, and the raw source is offered
 * as a one-click copy because most of these snippets are meant to be run.
 */
function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);

  // `pre` always wraps a single `code` element; read its class for the language
  // and its children for the text to copy.
  const child = Children.toArray(children)[0];
  const className = child?.props?.className ?? '';
  const language = /language-([\w-]+)/.exec(className)?.[1] ?? 'text';
  const source = textOf(child?.props?.children).replace(/\n$/, '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; the text is selectable either way.
    }
  };

  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-hairline bg-canvas-raised/85">
      <div className="flex items-center justify-between gap-2 border-b border-hairline py-1.5 pr-1.5 pl-4">
        <span className="font-mono text-xs text-ink-faint">{language}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-ink-faint transition-colors hover:bg-surface hover:text-ink"
        >
          {copied ? <IconCheck size={14} className="text-positive" /> : <IconCopy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[0.78rem] leading-6 text-ink sm:px-5 sm:text-[0.82rem]">
        {children}
      </pre>
    </div>
  );
}

const COMPONENTS = {
  h1: heading(2),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  a: MarkdownLink,
  p: ({ children }) => <p className="my-4 leading-relaxed text-ink-muted text-pretty">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="text-ink-muted italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-4 ml-1 space-y-2 [&_ul]:mt-2 [&_ul]:mb-0 [&_ul]:ml-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 ml-1 list-decimal space-y-2 pl-5 marker:text-ink-faint">{children}</ol>
  ),
  li: ({ children, className }) => (
    <li
      className={cn(
        'leading-relaxed text-ink-muted',
        // GFM task list items keep their checkbox and lose the bullet.
        className?.includes('task-list-item')
          ? 'list-none [&>input]:mr-2 [&>input]:accent-accent'
          : 'ml-4 list-disc marker:text-ink-faint',
      )}
    >
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-l-2 border-accent/50 pl-4 text-ink-muted italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-10 border-t border-hairline" />,
  pre: CodeBlock,
  code: ({ className, children }) => {
    // Fenced blocks arrive with a `language-*` class and are styled by the
    // surrounding `pre`; only inline code needs its own chip.
    if (className?.includes('language-')) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded-md border border-hairline bg-surface px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-2xl border border-hairline">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-hairline px-4 py-3 text-xs font-semibold tracking-wide text-ink uppercase">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-hairline px-4 py-3 align-top text-ink-muted last:border-r-0">
      {children}
    </td>
  ),
  tr: ({ children }) => <tr className="last:[&>td]:border-b-0">{children}</tr>,
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ''} className="my-5 rounded-2xl border border-hairline" />
  ),
};

/** Renders a GitHub-flavoured markdown string with the ONEIDP design tokens. */
export function Markdown({ children, className }) {
  return (
    <div className={cn('text-[0.95rem]', className)}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
