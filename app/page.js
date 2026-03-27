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

export default async function HomePage() {
  const status = await loadStatus();

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px' }}>
      <div style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 999, border: '1px solid #2a4b73', color: '#6dd3fb', marginBottom: 20 }}>
        Hostinger framework detection test · control-check-20260326
      </div>
      <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4.6rem)', lineHeight: 1, margin: '0 0 16px' }}>
        node.xdoes.space
      </h1>
      <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: '#9db0cf', maxWidth: 760 }}>
        This is now a secure proof that the deployed Next.js app can read public status data from Hostinger MySQL using server-side code only.
      </p>

      <section style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          ['Framework', 'Next.js 14'],
          ['Deploy target', 'node.xdoes.space'],
          ['Data source', status.ok ? 'Hostinger MySQL' : 'DB unavailable'],
          ['Next step', 'Turn this into the real agent control surface'],
        ].map(([label, value]) => (
          <div key={label} style={{ border: '1px solid #1e314d', background: '#101b2d', borderRadius: 18, padding: 20 }}>
            <div style={{ color: '#6dd3fb', fontSize: 14, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 36, border: '1px solid #1e314d', background: '#101b2d', borderRadius: 18, padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Database-backed status</h2>
        <p style={{ color: '#9db0cf', lineHeight: 1.7 }}>
          Credentials stay on the server. The browser only receives the rendered result of a server-side database query.
        </p>

        {status.ok ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 20 }}>
            {status.cards.map((card) => (
              <div key={card.slug} style={{ border: '1px solid #244061', background: '#0d1626', borderRadius: 18, padding: 20 }}>
                <div style={{ color: '#6dd3fb', fontSize: 14, marginBottom: 8 }}>{card.title}</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{card.valueText}</div>
                <div style={{ color: '#9db0cf', lineHeight: 1.6 }}>{card.publicNote}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: '#2a1616', border: '1px solid #723030', color: '#ffb4b4' }}>
            DB connection failed: {status.error}
          </div>
        )}
      </section>
    </main>
  );
}
