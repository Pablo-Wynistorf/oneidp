import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

/** Human wording for the audit trail's action codes. */
const ACTION_LABELS = {
  'user.ban': 'Suspended a user',
  'user.unban': 'Restored a user',
  'user.create': 'Created a user',
  'user.delete': 'Deleted a user',
  'user.revokeSessions': 'Signed a user out everywhere',
  'user.resetMfa': 'Reset two-factor authentication',
  'user.resetPasskey': 'Removed a passkey',
  'user.verifyEmail': 'Verified an email address',
  'user.revokeConsent': 'Revoked an app consent',
  'user.setPermissions': 'Changed permissions',
  'invitation.create': 'Sent an invitation',
  'invitation.resend': 'Resent an invitation',
  'invitation.revoke': 'Revoked an invitation',
  'app.delete': 'Deleted an application',
  'settings.update': 'Changed instance settings',
};

export function AdminOverviewPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get('/api/admin/overview')
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Could not load the overview.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <Card>
        <EmptyState title="Something went wrong" description={error} />
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
    );
  }

  const stats = [
    { label: 'Users', value: data.users.total, to: '/admin/users' },
    { label: 'Verified', value: data.users.verified, tone: 'positive' },
    { label: 'Suspended', value: data.users.banned, tone: 'danger', to: '/admin/users?status=banned' },
    { label: 'Active sessions', value: data.sessions.active < 0 ? '—' : data.sessions.active },
    { label: 'With 2FA', value: data.users.mfaEnabled, tone: 'accent' },
    { label: 'With passkey', value: data.users.passkeyEnabled, tone: 'accent' },
    { label: 'Applications', value: data.apps.total, to: '/admin/apps' },
    { label: 'App consents', value: data.consents.total },
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Card>
          <CardHeader title="Growth" description="New accounts over recent periods." />
          <CardBody className="space-y-3">
            <Row label="New in the last 7 days" value={data.users.newLast7Days} />
            <Row label="New in the last 30 days" value={data.users.newLast30Days} />
            <Row label="Awaiting email verification" value={data.users.unverified} />
            <Row label="Apps used in the last 7 days" value={data.consents.activeLast7Days} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sign-in methods" description="How accounts were created." />
          <CardBody className="space-y-3">
            {data.users.byProvider.length === 0 ? (
              <p className="text-sm text-ink-muted">No accounts yet.</p>
            ) : (
              data.users.byProvider.map((entry) => (
                <Row key={entry.provider} label={entry.provider} value={entry.count} />
              ))
            )}
            <div className="border-t border-hairline pt-3">
              <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                Administrators
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.admins.map((email) => (
                  <Badge key={email} tone="danger">
                    {email}
                  </Badge>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent admin activity"
          description="The last actions taken from this console."
        />
        <CardBody>
          {data.recentActions.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.recentActions.map((entry, index) => (
                <li
                  key={`${entry.at}-${index}`}
                  className="flex flex-col gap-1 rounded-xl border border-hairline bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {entry.actor}
                      {entry.targetEmail ? ` → ${entry.targetEmail}` : ''}
                      {entry.email ? ` → ${entry.email}` : ''}
                      {entry.appName ? ` → ${entry.appName}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {formatDateTime(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone = 'neutral', to }) {
  const body = (
    <>
      <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          tone === 'positive' && 'text-positive',
          tone === 'danger' && value > 0 && 'text-danger',
          tone === 'accent' && 'text-[#c3b5ff]',
        )}
      >
        {value}
      </p>
    </>
  );

  const className = cn(
    'rounded-[var(--radius-card)] border border-hairline bg-surface p-4 backdrop-blur-xl',
    to && 'transition-colors hover:border-hairline-strong',
  );

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-muted capitalize">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
