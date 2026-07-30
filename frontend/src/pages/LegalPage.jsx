import { Link } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/Button';
import { IconBack } from '@/components/ui/Icons';

const COMPANY = [
  ['Company', 'Oneidp'],
  ['Address', 'Schweiz, BE'],
  ['Email', 'support@oneidp.ch'],
];

/** Shared shell for the static legal pages. */
function LegalLayout({ title, tagline, children }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-8">
        <Link to="/" aria-label="ONEIDP home" className="rounded-lg">
          <Brand />
        </Link>
        <Button as={Link} to="/" variant="ghost" size="sm">
          <IconBack size={16} />
          Home
        </Button>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-10 pb-[calc(env(safe-area-inset-bottom)+3rem)] sm:px-6 sm:py-14">
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">{tagline}</p>

        <dl className="mt-8 grid gap-3 rounded-[var(--radius-card)] border border-hairline bg-surface p-5 sm:grid-cols-3">
          {COMPANY.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                {label}
              </dt>
              <dd className="mt-1 text-sm break-words text-ink">
                {label === 'Email' ? (
                  <a
                    href={`mailto:${value}`}
                    className="text-accent transition-colors hover:text-accent-hover"
                  >
                    {value}
                  </a>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 space-y-7 text-[0.95rem] leading-relaxed text-ink-muted">
          {children}
        </div>
      </main>
    </div>
  );
}

function Section({ heading, children }) {
  return (
    <section>
      {heading && <h2 className="mb-2 text-base font-semibold text-ink">{heading}</h2>}
      <div className="space-y-3 text-pretty">{children}</div>
    </section>
  );
}

export function ImprintPage() {
  return (
    <LegalLayout title="Imprint" tagline="Legal disclosure">
      <Section>
        <p>This website is governed by the laws of Switzerland.</p>
        <p>
          Dispute resolution information: We are not obliged nor willing to participate in dispute
          resolution proceedings before a consumer arbitration board.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy policy" tagline="Your privacy matters">
      <Section heading="Information we collect">
        <p>We collect various types of information, including personal data, usage data, and cookies.</p>
      </Section>
      <Section heading="How we use your information">
        <p>Your information is used to provide and improve our services and communicate with you.</p>
      </Section>
      <Section heading="Data security">
        <p>We take data security seriously and implement measures to protect your information.</p>
      </Section>
      <Section heading="Your rights">
        <p>
          You have rights regarding your personal data, including access, correction, and deletion.
        </p>
      </Section>
      <Section heading="Contact us">
        <p>
          If you have any questions about this privacy policy, please contact us at{' '}
          <a
            href="mailto:support@oneidp.ch"
            className="text-accent transition-colors hover:text-accent-hover"
          >
            support@oneidp.ch
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}
