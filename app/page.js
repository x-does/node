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

const offerings = [
  {
    title: 'Services',
    body: 'Fast, practical web work: landing pages, proof-of-concept builds, automation, and public dashboards that make progress visible.',
  },
  {
    title: 'Products',
    body: 'Small tools and reusable web products designed to ship quickly, learn quickly, and evolve into something people actually pay for.',
  },
  {
    title: 'Free releases',
    body: 'Useful utilities, templates, and open experiments that build trust, attract users, and create a path to future paid offers.',
  },
];

const priorities = [
  'Make the site public-first and easy to understand in a few seconds.',
  'Show live proof when available, but never expose secrets or internal-only links.',
  'Turn the page into a launchpad for services, products, and free releases.',
  'Keep the messaging focused on what users can get now and what is coming next.',
];

const EVENT_KEY = 'node_audit_20260328';

const roadmap = [
  {
    label: 'Now',
    text: 'Service pages, clean landing pages, and simple proof-of-work builds.',
  },
  {
    label: 'Next',
    text: 'Tiny paid products with clear value and lightweight onboarding.',
  },
  {
    label: 'Later',
    text: 'Free releases that seed the audience and feed the bigger products.',
  },
];

export default async function HomePage() {
  const status = await loadStatus();

  return (
    <main style={styles.shell}>
      <section style={styles.hero}>
        <div style={styles.badge}>node.xdoes.space · launchpad</div>
        <div style={styles.heroGrid}>
          <div>
            <h1 style={styles.h1}>Services, products, and free releases.</h1>
            <p style={styles.lead}>
              node.xdoes.space is the public face of the build team: a place to show what we sell,
              what we are making next, and what we release for free to earn attention, trust, and revenue.
            </p>
            <div style={styles.ctaRow}>
              <a style={styles.primaryButton} href="#offerings">See offerings</a>
              <a style={styles.secondaryButton} href={`/api/audit-click?src=hero_primary&event=${EVENT_KEY}`}>
                Request a paid Node Revenue Audit
              </a>
            </div>
          </div>

          <aside style={styles.sideCard}>
            <div style={styles.sideTitle}>What this page should do</div>
            <ul style={styles.list}>
              {priorities.map((item) => (
                <li key={item} style={styles.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section id="offerings" style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>What we offer</h2>
          <p style={styles.muted}>Clear categories. No clutter. No internal-only links on the public page.</p>
        </div>
        <div style={styles.cardGrid3}>
          {offerings.map((item) => (
            <article key={item.title} style={styles.card}>
              <h3 style={styles.h3}>{item.title}</h3>
              <p style={styles.cardBody}>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Why this exists</h2>
          <p style={styles.muted}>Turn the site into a public storefront for the agents team.</p>
        </div>
        <div style={styles.cardGrid2}>
          {roadmap.map((item) => (
            <article key={item.label} style={styles.card}>
              <div style={styles.loopRow}>
                <h3 style={styles.h3}>{item.label}</h3>
                <span style={styles.pill}>{item.label}</span>
              </div>
              <p style={styles.cardBody}>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="status" style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Live status</h2>
          <p style={styles.muted}>Rendered server-side from Hostinger MySQL when available.</p>
        </div>

        <div style={styles.highlightRow}>
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Site</div>
            <div style={styles.metricValue}>node.xdoes.space</div>
          </div>
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Goal</div>
            <div style={styles.metricValue}>Public conversion</div>
          </div>
          <div style={styles.metric}>
            <div style={styles.metricLabel}>Format</div>
            <div style={styles.metricValue}>Launch page</div>
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
          <div style={styles.errorBox}>DB connection failed: {status.error}</div>
        )}
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>What users should see</h2>
          <p style={styles.muted}>Short, useful, and aligned with what the team is actually selling.</p>
        </div>
        <div style={styles.cardGrid2}>
          <article style={styles.card}>
            <h3 style={styles.h3}>Services first</h3>
            <p style={styles.cardBody}>
              The homepage should make it obvious that the team can build, polish, and ship web work quickly.
            </p>
          </article>
          <article style={styles.card}>
            <h3 style={styles.h3}>Products next</h3>
            <p style={styles.cardBody}>
              New products should be introduced with a simple promise, a clear audience, and a fast path to test demand.
            </p>
          </article>
          <article style={styles.card}>
            <h3 style={styles.h3}>Free releases help growth</h3>
            <p style={styles.cardBody}>
              Free tools and experiments can build trust and bring people back when the paid offers are ready.
            </p>
          </article>
          <article style={styles.card}>
            <h3 style={styles.h3}>Keep it public-safe</h3>
            <p style={styles.cardBody}>
              Internal-only bot names, private workflows, and sensitive links should stay off the public face of the site.
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
    maxWidth: 820,
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
  errorBox: {
    padding: 18,
    borderRadius: 18,
    background: 'rgba(83, 20, 20, 0.9)',
    border: '1px solid rgba(255, 116, 116, 0.35)',
    color: '#ffd0d0',
  },
};
