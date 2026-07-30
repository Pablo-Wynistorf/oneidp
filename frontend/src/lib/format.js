/** Shared formatting + small pure helpers. */

const DATE_ONLY = { year: 'numeric', month: 'short', day: 'numeric' };

/** "12 Mar 2026" style date, or a dash when the value is missing/invalid. */
export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, DATE_ONLY);
}

/** Full date + time, from a unix seconds timestamp or a date string. */
export function formatDateTime(value) {
  if (!value) return '—';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

/** Origin of a redirect URI, used to build "Open app" links. */
export function originOf(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** First character of a name, for avatar monograms. */
export function initial(text) {
  return (text || '?').trim().charAt(0).toUpperCase() || '?';
}

/** Gravatar URL for an email address (SHA-256, per Gravatar's current API). */
export async function gravatarUrl(email) {
  if (!email || !globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&r=PG&s=160`;
}

/** Copy text to the clipboard, falling back for non-secure contexts. */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('Copy failed');
}
