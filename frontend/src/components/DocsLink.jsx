import { Link } from 'react-router-dom';

/**
 * Link into the integration docs.
 *
 * Docs always open in a new tab: reading them is a side trip, and nobody should
 * lose a half-filled client registration or a login form to it. Navigation
 * *inside* the docs route stays in the same tab and uses `Link` directly.
 *
 * Renders a router `Link` so the `to` prop keeps working; the browser handles
 * the actual navigation because of `target`. Pass it to `Button` via
 * `as={DocsLink}` for the button-shaped variants.
 */
export function DocsLink({ to, ...props }) {
  return <Link to={to} target="_blank" rel="noreferrer" {...props} />;
}
