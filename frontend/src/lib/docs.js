/**
 * The integration docs, rendered from the markdown in the repository's `/docs`
 * folder.
 *
 * The markdown files are the single source of truth: they are imported raw at
 * build time and inlined into the docs chunk, so editing a file under `/docs`
 * is all it takes to update this route. Nothing is fetched at runtime.
 */

import indexMd from '../../../docs/README.md?raw';
import quickstartMd from '../../../docs/quickstart.md?raw';
import endpointsMd from '../../../docs/endpoints.md?raw';
import tokensMd from '../../../docs/tokens.md?raw';
import clientRegistrationMd from '../../../docs/client-registration.md?raw';
import notesMd from '../../../docs/notes-and-limitations.md?raw';

/**
 * Ordered table of contents. `slug` doubles as the URL segment, except for
 * `index` which is served at `/docs` itself.
 *
 * `file` is the markdown filename so relative links between the documents
 * (`./endpoints.md#post-apioauthtoken`) can be rewritten to in-app routes.
 */
const PAGES = [
  {
    slug: 'index',
    file: 'README.md',
    nav: 'Overview',
    summary: 'What ONEIDP supports, the discovery document, and the flow at a glance.',
    raw: indexMd,
  },
  {
    slug: 'quickstart',
    file: 'quickstart.md',
    nav: 'Quickstart',
    summary: 'Register a client and complete a login in about ten minutes.',
    raw: quickstartMd,
  },
  {
    slug: 'endpoints',
    file: 'endpoints.md',
    nav: 'Endpoint reference',
    summary: 'Every OIDC endpoint: parameters, responses, and error shapes.',
    raw: endpointsMd,
  },
  {
    slug: 'tokens',
    file: 'tokens.md',
    nav: 'Tokens and claims',
    summary: 'Token formats, lifetimes, claims, and how to validate them.',
    raw: tokensMd,
  },
  {
    slug: 'client-registration',
    file: 'client-registration.md',
    nav: 'Client registration',
    summary: 'Client types, the management API, roles, and consent.',
    raw: clientRegistrationMd,
  },
  {
    slug: 'notes-and-limitations',
    file: 'notes-and-limitations.md',
    nav: 'Notes and limitations',
    summary: 'Where ONEIDP deviates from the specs. Read before you debug.',
    raw: notesMd,
  },
];

/** `/docs` for the index page, `/docs/<slug>` for everything else. */
export function docPath(slug) {
  return slug === 'index' ? '/docs' : `/docs/${slug}`;
}

/**
 * GitHub-flavoured heading slugs: lowercase, punctuation dropped, spaces to
 * hyphens. Keeping the same algorithm means the anchors already written into
 * the markdown (`#post-apioauthrevoke`) resolve without rewriting them.
 */
export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .replace(/\s+/g, '-');
}

/** Drop the inline markdown that headings use, so a TOC entry reads as text. */
function plainText(markdown) {
  return markdown
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .trim();
}

/**
 * Peel the leading `# Title` off the body: the page renders it as its own
 * heading, so leaving it in the markdown would print it twice.
 */
function splitHeading(raw) {
  const match = /^\s*#\s+(.+?)\s*\n+/.exec(raw);
  if (!match) return { title: null, body: raw };
  return { title: plainText(match[1]), body: raw.slice(match[0].length) };
}

/** Second-level headings, skipping anything inside a fenced code block. */
function tableOfContents(body) {
  const entries = [];
  let inFence = false;

  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      const label = plainText(match[1]);
      entries.push({ id: slugify(label), label });
    }
  }

  return entries;
}

/** Every page, with its title, body and TOC precomputed once per load. */
export const DOCS = PAGES.map((page) => {
  const { title, body } = splitHeading(page.raw);
  return {
    slug: page.slug,
    file: page.file,
    path: docPath(page.slug),
    nav: page.nav,
    summary: page.summary,
    title: title || page.nav,
    body,
    headings: tableOfContents(body),
  };
});

const BY_SLUG = new Map(DOCS.map((page) => [page.slug, page]));
const BY_FILE = new Map(DOCS.map((page) => [page.file, page]));

export function getDoc(slug = 'index') {
  return BY_SLUG.get(slug) ?? null;
}

/** Position in the reading order, for the previous/next footer links. */
export function getDocNeighbours(slug) {
  const index = DOCS.findIndex((page) => page.slug === slug);
  if (index === -1) return { previous: null, next: null };
  return { previous: DOCS[index - 1] ?? null, next: DOCS[index + 1] ?? null };
}

/**
 * Turn a link from the markdown into something the SPA can use.
 *
 * - `./tokens.md#access-token` becomes the in-app route `/docs/tokens#access-token`
 * - `#cors` stays an in-page anchor
 * - `/oidc/apps` stays an in-app route
 * - anything with a scheme is treated as external
 */
export function resolveDocHref(href) {
  if (!href) return { kind: 'external', href: '#' };

  if (href.startsWith('#')) return { kind: 'anchor', href };

  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
    return { kind: 'external', href };
  }

  const [target, hash] = href.split('#');
  const file = target.replace(/^\.?\//, '');

  if (file.endsWith('.md')) {
    const page = BY_FILE.get(file);
    if (page) return { kind: 'internal', href: hash ? `${page.path}#${hash}` : page.path };
  }

  if (href.startsWith('/')) return { kind: 'internal', href };

  return { kind: 'external', href };
}
