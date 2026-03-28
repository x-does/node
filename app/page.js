import { getPublicStatusCards } from '../lib/db.js';

export const dynamic = 'force-dynamic';

async function loadStatus() {
  try {
    const cards = await getPublicStatusCards();
    return { ok: true, cards };
  } catch (error) {
    return {
      ok: false,
      cards: [],
      error: error instanceof Error ? error.message : 'Failed to load DB status',
    };
  }
}

const pillars = [
  {
    title: 'Build products that earn',
    body: 'Ship small, useful web products that can show traction fast and turn into recurring revenue.',
  },
  {
    title: 'Make the loop self-sustaining',
    body: 'Use cron, agents, and shared ops files to keep strategy, build, growth, and finance in sync.',
  },
  {
    title: 'Prove value on the live site',
    body: 'Surface real status, actions, and proof on node.xdoes.space so the product is not just a shell.',
  },
];

const loops = [
  {
    name: 'CEO',
    cadence: 'Every 2 hours',
    role: 'Set priorities, choose the bottleneck, assign work.',
  },
  {
    name: 'CTO',
    cadence: 'Every 1 hour',
    role: 'Ship the best technical slice and verify it live.',
  },
  {
    name: 'CFO',
    cadence: 'Every 6 hours',
    role: 'Find revenue, pricing, affiliate, and partnership moves.',
  },
  {
    name: 'CMO',
    cadence: 'Every 4 hours',
    role: 'Run distribution, content, and growth experiments.',
  },
];

const nextActions = [
  'Use the homepage as the command center for the node product.',
  'Show public DB-backed proof without exposing secrets.',
  'Keep the current product goal visible: self-sustenance and money.',
  'Make the cron jobs easier to steer by showing what each loop owns.',
];

const auditCta = {
  href: 'https://t.me/world_fuckery_bot?start=node_audit_20260328',
  label: 'Request a paid Node Revenue Audit',
  trackingRule: 'Count unique Telegram /start payloads: node_audit_20260328',
};

export default async function HomePage() {
  const status = await loadStatus();

  return (
    <main style={styles.shell}>
      <section style={styles.hero}>
        <div style={styles.badge}>node.xdoes.space · control surface</div>
        <div style={styles.heroGrid}>
          <div>
            <h1 style={styles.h1}>Build the money loop.</h1>
            <p style={styles.lead}>
              This dashboard is the front door for the current node product: it shows live status,
              operating loops, and the next actions needed to get to self-sustaining revenue.
            </p>
            <div style={styles.ctaRow}>
              <a style={styles.primaryButton} href="#status">View live status</a>
              <a style={styles.secondaryButton} href="#audit">See the paid audit CTA</a>
            </div>
          </div>

          <aside style={styles.sideCard}>
            <div style={styles.sideTitle}>What this site should do</div>
            <ul style={styles.list}>
              {nextActions.map((item) => (
                <li key={item} style={styles.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>The operating thesis</h2>
          <p style={styles.muted}>Small product loops, clear ownership, measurable output.</p>
        </div>
        <div style={styles.cardGrid3}>
          {pillars.map((pillar) => (
            <article key={pillar.title} style={styles.card}>
              <h3 style={styles.h3}>{pillar.title}</h3>
              <p style={styles.cardBody}>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="loops" style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Cron job map</h2>
          <p style={styles.muted}>Each loop has one job. No noise, no duplicate ownership.</p>
        </div>
        <div style={styles.cardGrid2}>
          {loops.map((loop) => (
            <article key={loop.name} style={styles.card}>
              <div style={styles.loopRow}>
                <h3 style={styles.h3}>{loop.name}</h3>
                <span style={styles.pill}>{loop.cadence}</span>
              </div>
              <p style={styles.cardBody}>{loop.role}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="audit" style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Single paid offer</h2>
          <p style={styles.muted}>One CTA only until conversion tracking matures.</p>
        </div>

        <article style={styles.auditCard}>
          <div style={styles.auditEyebrow}>Revenue path</div>
          <h3 style={styles.auditTitle}>Node Revenue / Automation Audit</h3>
          <p style={styles.cardBody}>
            If you want a focused technical + growth teardown for your Node stack, request a paid
            audit directly through Telegram.
          </p>
          <div style={styles.ctaRow}>
            <a style={styles.auditButton} href={auditCta.href} target="_blank" rel="noreferrer">
              {auditCta.label}
            </a>
          </div>
          <p style={styles.trackingNote}>Tracking rule: {auditCta.trackingRule}</p>
        </article>
      </section>

      <section id="status" style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Live status from Hostinger MySQL</h2>
          <p style={styles.muted}>Public cards are rendered server-side. Secrets stay on the server.</p>
        </div>

        <div style={styles.highlightRow}>
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Deploy target</div>
            <div style={styles.metricValue}>node.xdoes.space</div>
          </div>
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Product repo</div>
            <div style={styles.metricValue}>x-does/node</div>
          </div>
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Purpose</div>
            <div style={styles.metricValue}>Self-sustaining revenue</div>
          </div>
        </div>

        {status.ok ? (
          <div style={styles.cardGrid2}>
            {status.cards.map((card) => (
              <article key={card.slug} style={styles.statusCard}>
                <div style={styles.statusLabel}>{card.title}</div>
                <div style={styles.statusValue}>{card.valueText}</div>
                <p style={styles.statusNote}>{card.publicNote}</p>
              </article>
            ))}
          </div>
        ) : (
          <div style={styles.errorBox}>
            DB connection failed: {status.error}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>What the cron jobs should create</h2>
          <p style={styles.muted}>A useful site gives the agents a place to push progress toward money.</p>
        </div>
        <div style={styles.cardGrid2}>
          <article style={styles.card}>
            <h3 style={styles.h3}>Products</h3>
            <p style={styles.cardBody}>
              Lead magnets, small utilities, proof pages, and conversion-focused landing pages.
            </p>
          </article>
          <article style={styles.card}>
            <h3 style={styles.h3}>Signals</h3>
            <p style={styles.cardBody}>
              Traffic, clicks, signups, replies, and revenue markers that show whether a loop is working.
            </p>
          </article>
          <article style={styles.card}>
            <h3 style={styles.h3}>Actions</h3>
            <p style={styles.cardBody}>
              Clear next steps for CEO, CTO, CFO, and CMO so the system can keep moving without stalling.
            </p>
          </article>
          <article style={styles.card}>
            <h3 style={styles.h3}>Proof</h3>
            <p style={styles.cardBody}>
              Live DB-backed cards, deployed pages, and a visible operating model that can be checked quickly.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

const styles = {
  shell: {
    minHeight: '100vh',
    padding: '56px 20px 72px',
    background:
      'radial-gradient(circle at top, rgba(45, 125, 255, 0.18), transparent 34%), linear-gradient(180deg, #08111f 0%, #050b14 100%)',
    color: '#ecf3ff',
    fontFamily: 'Inter, Arial, sans-serif',
  },
  hero: {
    maxWidth: 1180,
    margin: '0 auto',
    padding: '28px 0 8px',
  },
  badge: {
    display: 'inline-block',
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(111, 197, 255, 0.28)',
    background: 'rgba(9, 19, 35, 0.8)',
    color: '#79d7ff',
    fontSize: 13,
    letterSpacing: 0.3,
    marginBottom: 20,
  },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 0.9fr)',
    gap: 20,
    alignItems: 'stretch',
  },
  h1: {
    fontSize: 'clamp(2.8rem, 6vw, 5.4rem)',
    lineHeight: 0.95,
    margin: '0 0 18px',
    maxWidth: 780,
  },
  lead: {
    fontSize: '1.1rem',
    lineHeight: 1.75,
    color: '#a8b9d8',
    maxWidth: 760,
    margin: 0,
  },
  ctaRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 26,
  },
  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 18px',
    borderRadius: 14,
    background: 'linear-gradient(135deg, #59b7ff, #7d5bff)',
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 700,
  },
  secondaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 18px',
    borderRadius: 14,
    border: '1px solid rgba(125, 165, 225, 0.28)',
    background: 'rgba(12, 23, 41, 0.92)',
    color: '#dce9ff',
    textDecoration: 'none',
    fontWeight: 700,
  },
  sideCard: {
    border: '1px solid rgba(125, 165, 225, 0.18)',
    borderRadius: 24,
    padding: 22,
    background: 'rgba(7, 14, 27, 0.82)',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.2)',
  },
  sideTitle: {
    fontSize: 15,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#7fd5ff',
    marginBottom: 12,
  },
  list: {
    margin: 0,
    paddingLeft: 18,
    color: '#b8c7e3',
    lineHeight: 1.7,
  },
  listItem: {
    marginBottom: 10,
  },
  section: {
    maxWidth: 1180,
    margin: '28px auto 0',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'end',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  h2: {
    margin: 0,
    fontSize: '1.6rem',
  },
  muted: {
    margin: 0,
    color: '#8ea1c4',
  },
  cardGrid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 16,
  },
  cardGrid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 16,
  },
  card: {
    border: '1px solid rgba(125, 165, 225, 0.16)',
    background: 'rgba(10, 18, 31, 0.92)',
    borderRadius: 22,
    padding: 20,
  },
  h3: {
    margin: '0 0 10px',
    fontSize: '1.1rem',
  },
  cardBody: {
    margin: 0,
    color: '#a7b7d6',
    lineHeight: 1.7,
  },
  loopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  pill: {
    display: 'inline-flex',
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(89, 183, 255, 0.12)',
    color: '#84d9ff',
    border: '1px solid rgba(89, 183, 255, 0.18)',
    fontSize: 12,
    fontWeight: 700,
  },
  highlightRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  metric: {
    border: '1px solid rgba(125, 165, 225, 0.16)',
    background: 'rgba(10, 18, 31, 0.92)',
    borderRadius: 20,
    padding: 18,
  },
  metricLabel: {
    color: '#7fd5ff',
    fontSize: 13,
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 800,
  },
  statusCard: {
    border: '1px solid rgba(125, 165, 225, 0.16)',
    background: 'rgba(10, 18, 31, 0.92)',
    borderRadius: 20,
    padding: 20,
  },
  statusLabel: {
    color: '#7fd5ff',
    fontSize: 13,
    marginBottom: 8,
  },
  statusValue: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 10,
  },
  statusNote: {
    margin: 0,
    color: '#a7b7d6',
    lineHeight: 1.65,
  },
  auditCard: {
    border: '1px solid rgba(144, 111, 255, 0.35)',
    background: 'linear-gradient(160deg, rgba(35, 20, 75, 0.92), rgba(12, 18, 34, 0.95))',
    borderRadius: 22,
    padding: 24,
    boxShadow: '0 18px 40px rgba(29, 15, 67, 0.45)',
  },
  auditEyebrow: {
    color: '#c2afff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: 700,
  },
  auditTitle: {
    margin: '0 0 12px',
    fontSize: '1.4rem',
  },
  auditButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 18px',
    borderRadius: 14,
    background: 'linear-gradient(135deg, #8f6bff, #4f9bff)',
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 800,
  },
  trackingNote: {
    margin: '14px 0 0',
    color: '#c7d4f0',
    fontSize: 14,
  },
  errorBox: {
    padding: 18,
    borderRadius: 18,
    background: 'rgba(83, 20, 20, 0.9)',
    border: '1px solid rgba(255, 116, 116, 0.35)',
    color: '#ffd0d0',
  },
};
