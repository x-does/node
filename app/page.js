export default function HomePage() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px' }}>
      <div style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 999, border: '1px solid #2a4b73', color: '#6dd3fb', marginBottom: 20 }}>
        Hostinger framework detection test
      </div>
      <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4.6rem)', lineHeight: 1, margin: '0 0 16px' }}>
        node.xdoes.space
      </h1>
      <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: '#9db0cf', maxWidth: 760 }}>
        This is a minimal Next.js application pushed specifically so Hostinger can detect a supported framework and import the repo cleanly.
      </p>

      <section style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          ['Framework', 'Next.js 14'],
          ['Goal', 'Verify Hostinger Git import'],
          ['Deploy target', 'node.xdoes.space'],
          ['Next step', 'Connect repo from Hostinger panel'],
        ].map(([label, value]) => (
          <div key={label} style={{ border: '1px solid #1e314d', background: '#101b2d', borderRadius: 18, padding: 20 }}>
            <div style={{ color: '#6dd3fb', fontSize: 14, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 36, border: '1px solid #1e314d', background: '#101b2d', borderRadius: 18, padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>What should happen now</h2>
        <ol style={{ color: '#9db0cf', lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Hostinger should detect this as a Next.js project.</li>
          <li>You should be able to connect the repo without the “invalid project structure” error.</li>
          <li>Once the import works, we can extend this into the real agent control surface.</li>
        </ol>
      </section>
    </main>
  );
}
