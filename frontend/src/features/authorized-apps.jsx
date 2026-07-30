import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconExternal } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/Spinner';
import { api, SessionExpiredError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, initial, originOf } from '@/lib/format';

/**
 * Loads the applications the current user has consented to.
 * Shared by the dashboard summary and the full "Authorized apps" page.
 */
export function useAuthorizedApps() {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/oauth/user-consents');
      setApps(data?.apps ?? []);
      setError(null);
    } catch (requestError) {
      if (requestError instanceof SessionExpiredError) return;
      setApps([]);
      setError('Could not load your authorized applications.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = useCallback(
    async (clientId) => {
      await api.del(`/api/oauth/user-consents/${encodeURIComponent(clientId)}`);
      await load();
    },
    [load],
  );

  return { apps, error, reload: load, revoke };
}

/** One consented application. */
export function AuthorizedAppCard({ app, onRevoke, className }) {
  const origin = originOf(app.redirectUri);

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border border-hairline bg-surface p-4',
        'transition-colors duration-150 hover:border-hairline-strong',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-cyan text-sm font-semibold text-white">
          {initial(app.appName)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-ink" title={app.appName}>
            {app.appName}
          </h3>
          <p className="truncate font-mono text-[0.7rem] text-ink-faint" title={app.clientId}>
            {app.clientId}
          </p>
        </div>
      </div>

      {app.consentedScopes?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {app.consentedScopes.map((scope) => (
            <Badge key={scope} tone="accent">
              {scope}
            </Badge>
          ))}
        </div>
      )}

      <dl className="mt-3 space-y-0.5 text-xs text-ink-muted">
        <div className="flex gap-1.5">
          <dt className="text-ink-faint">First authorized</dt>
          <dd>{formatDate(app.firstAuthAt)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-ink-faint">Last used</dt>
          <dd>{formatDate(app.lastAuthAt)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex gap-2 pt-1">
        {origin && (
          <Button as="a" href={origin} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm" className="flex-1">
            <IconExternal size={15} />
            Open
          </Button>
        )}
        <Button
          variant="outlineDanger"
          size="sm"
          className="flex-1"
          onClick={() => onRevoke(app)}
        >
          Revoke
        </Button>
      </div>
    </article>
  );
}

/** Loading placeholder matching the card's shape. */
export function AuthorizedAppSkeleton() {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-3 w-40" />
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-9 w-full" />
    </div>
  );
}
