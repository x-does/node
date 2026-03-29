import { AUDIT_EVENT_KEY, ROOT_PARITY_MARKER, buildAuditClickHref } from '../../lib/audit-config.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVENT_KEY = AUDIT_EVENT_KEY;
const PARITY_MARKER = ROOT_PARITY_MARKER;

export default function AuditPage() {
  return (
    <main style={styles.shell}>
      <section style={styles.wrap}>
        <div style={styles.badge}>node.xdoes.space · audit intake</div>
        <h1 style={styles.h1}>Node Revenue / Automation Audit</h1>
        <p style={styles.lead}>
          If your automations, agents, or revenue loop are leaking, this path goes straight to the tracked audit intake.
        </p>

        <div style={styles.ctaRow}>
          <a
            style={styles.primaryButton}
            href={buildAuditClickHref('audit_page_primary', EVENT_KEY)}
          >
            Start the paid audit
          </a>
          <a
            style={styles.secondaryButton}
            href={buildAuditClickHref('audit_page_secondary', EVENT_KEY)}
          >
            Prefer the fallback audit link
          </a>
        </div>

        <ul style={styles.list}>
          <li>Tracking key: <code>{EVENT_KEY}</code></li>
          <li>Parity marker: <code>{PARITY_MARKER}</code></li>
          <li>This page is kept dynamic/no-store for verification stability.</li>
        </ul>
      </section>
    </main>
  );
}

const styles = {
  shell: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #08111f 0%, #050b14 100%)',
    color: '#ecf3ff',
    fontFamily: 'Inter, Arial, sans-serif',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
  },
  wrap: {
    width: '100%',
    maxWidth: '760px',
    border: '1px solid rgba(111, 197, 255, 0.25)',
    background: 'rgba(6, 16, 30, 0.9)',
    borderRadius: '18px',
    padding: '28px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  },
  badge: {
    display: 'inline-block',
    border: '1px solid rgba(111, 197, 255, 0.35)',
    borderRadius: '999px',
    padding: '7px 12px',
    color: '#79d7ff',
    marginBottom: '14px',
    fontSize: '13px',
  },
  h1: {
    margin: '0 0 10px',
    fontSize: '34px',
    lineHeight: 1.2,
  },
  lead: {
    margin: '0 0 18px',
    color: 'rgba(236, 243, 255, 0.88)',
    lineHeight: 1.6,
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    margin: '0 0 16px',
  },
  primaryButton: {
    display: 'inline-block',
    textDecoration: 'none',
    color: '#081122',
    background: 'linear-gradient(180deg, #80e6ff 0%, #43c9ff 100%)',
    padding: '12px 16px',
    borderRadius: '10px',
    fontWeight: 700,
  },
  secondaryButton: {
    display: 'inline-block',
    textDecoration: 'none',
    color: '#ecf3ff',
    background: 'rgba(17, 34, 59, 0.9)',
    border: '1px solid rgba(122, 154, 205, 0.5)',
    padding: '12px 16px',
    borderRadius: '10px',
    fontWeight: 600,
  },
  list: {
    margin: 0,
    paddingLeft: '18px',
    color: 'rgba(236, 243, 255, 0.8)',
    lineHeight: 1.6,
  },
};
