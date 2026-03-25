import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const leadsFile = process.env.LEADS_FILE || path.join(dataDir, 'leads.json');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const appName = process.env.APP_NAME || 'node.xdoes.space';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.end(html);
}

async function ensureDataStore() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(leadsFile)) {
    await writeFile(leadsFile, '[]\n', 'utf8');
  }
}

async function readLeads() {
  await ensureDataStore();
  const raw = await readFile(leadsFile, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLeads(leads) {
  await ensureDataStore();
  await writeFile(leadsFile, JSON.stringify(leads, null, 2) + '\n', 'utf8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function layout(content) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${appName} — build engine</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07111f;
        --panel: #101b2d;
        --muted: #9db0cf;
        --text: #ecf3ff;
        --accent: #6dd3fb;
        --accent2: #9bffb4;
        --danger: #ff8f8f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background: radial-gradient(circle at top, #132443 0%, var(--bg) 60%);
        color: var(--text);
      }
      .wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 48px 20px 80px;
      }
      .hero, .panel {
        background: rgba(16, 27, 45, 0.88);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px;
        padding: 28px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
        backdrop-filter: blur(8px);
      }
      h1, h2, h3 { margin-top: 0; }
      h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1; margin-bottom: 12px; }
      p { color: var(--muted); line-height: 1.6; }
      .grid {
        display: grid;
        gap: 20px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        margin-top: 20px;
      }
      .metric {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        padding: 16px;
      }
      .metric strong {
        display: block;
        font-size: 1.7rem;
        color: var(--accent2);
        margin-bottom: 4px;
      }
      .stack {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
      }
      .pill {
        border: 1px solid rgba(109,211,251,0.35);
        color: var(--accent);
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 0.95rem;
      }
      form {
        display: grid;
        gap: 12px;
        margin-top: 20px;
      }
      input, textarea, button {
        width: 100%;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.04);
        color: var(--text);
        padding: 14px 16px;
        font: inherit;
      }
      button {
        cursor: pointer;
        background: linear-gradient(135deg, var(--accent), #4e90ff);
        color: #04131d;
        font-weight: 700;
        border: none;
      }
      .row {
        display: grid;
        gap: 20px;
        grid-template-columns: 1.1fr 0.9fr;
        margin-top: 24px;
      }
      .small { font-size: 0.95rem; color: var(--muted); }
      @media (max-width: 760px) {
        .row { grid-template-columns: 1fr; }
      }
      code {
        background: rgba(255,255,255,0.06);
        border-radius: 8px;
        padding: 2px 6px;
      }
      .ok { color: var(--accent2); }
      .warn { color: var(--danger); }
    </style>
  </head>
  <body>
    <main class="wrap">${content}</main>
  </body>
</html>`;
}

function homePage() {
  return layout(`
    <section class="hero">
      <div class="pill">proof of concept · revenue engine hub</div>
      <h1>${appName}</h1>
      <p>
        This is the first Node app for the <strong>x-does</strong> machine: a lightweight control surface for builds,
        monetization experiments, and lead capture. It is deliberately simple, deployable on Hostinger, and ready
        to become the place where CEO / CTO / CFO / CMO loops publish progress and collect signals.
      </p>
      <div class="grid">
        <div class="metric"><strong>4</strong> operator loops ready to plug in<br /><span class="small">CEO · CTO · CFO · CMO</span></div>
        <div class="metric"><strong>1</strong> proof-of-concept app<br /><span class="small">deployable on <code>node.xdoes.space</code></span></div>
        <div class="metric"><strong>2</strong> APIs already planned<br /><span class="small">health/status + lead capture</span></div>
      </div>
      <div class="stack">
        <span class="pill">Node.js only</span>
        <span class="pill">No dependencies</span>
        <span class="pill">Hostinger-friendly</span>
        <span class="pill">Lead capture built in</span>
      </div>
    </section>

    <section class="row">
      <div class="panel">
        <h2>What this POC already does</h2>
        <p>
          The app serves a landing page, exposes <code>/health</code> and <code>/api/status</code>, and stores inbound
          lead requests through <code>POST /api/leads</code> in a local JSON file. That gives us a working, inspectable,
          money-adjacent asset we can deploy immediately while the automation loops are rebuilt.
        </p>
        <ul>
          <li><span class="ok">/health</span> → fast uptime check</li>
          <li><span class="ok">/api/status</span> → machine + product summary</li>
          <li><span class="ok">/api/leads</span> → inbound lead capture</li>
          <li><span class="ok">/api/leads/list</span> → simple local lead inspection</li>
        </ul>
        <p class="small">
          Next obvious evolution: wire this to Hostinger MCP deployment metadata, analytics snapshots, and a simple
          queue of revenue experiments the cron jobs can update.
        </p>
      </div>

      <div class="panel">
        <h2>Request a build / collab</h2>
        <p>Drop a name and email. This acts as our first conversion capture on <code>node.xdoes.space</code>.</p>
        <form id="lead-form">
          <input name="name" placeholder="Your name" required />
          <input name="email" type="email" placeholder="Email" required />
          <textarea name="idea" placeholder="What should we build or automate for you?" rows="5"></textarea>
          <button type="submit">Send lead</button>
        </form>
        <p id="form-status" class="small"></p>
      </div>
    </section>

    <script>
      const form = document.getElementById('lead-form');
      const status = document.getElementById('form-status');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.textContent = 'Sending…';
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          status.textContent = data.error || 'Something broke.';
          status.className = 'small warn';
          return;
        }
        status.textContent = 'Lead stored. We can now build the next loop around it.';
        status.className = 'small ok';
        form.reset();
      });
    </script>
  `);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/') {
    return sendHtml(res, 200, homePage());
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      service: appName,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const leads = await readLeads();
    return sendJson(res, 200, {
      app: appName,
      mission: 'Build deployable assets, capture demand, and turn agent loops into revenue.',
      leadsCaptured: leads.length,
      endpoints: ['GET /', 'GET /health', 'GET /api/status', 'POST /api/leads', 'GET /api/leads/list'],
      nextMoves: [
        'Connect Hostinger MCP deployment metadata',
        'Add revenue experiment queue',
        'Let cron jobs publish updates here',
      ],
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/leads/list') {
    const leads = await readLeads();
    return sendJson(res, 200, { count: leads.length, leads });
  }

  if (req.method === 'POST' && url.pathname === '/api/leads') {
    try {
      const rawBody = await parseBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const name = String(payload.name || '').trim();
      const email = String(payload.email || '').trim();
      const idea = String(payload.idea || '').trim();

      if (!name || !email) {
        return sendJson(res, 400, { error: 'name and email are required' });
      }

      const leads = await readLeads();
      const lead = {
        id: `lead_${Date.now()}`,
        name,
        email,
        idea,
        createdAt: new Date().toISOString(),
        source: appName,
      };
      leads.unshift(lead);
      await writeLeads(leads.slice(0, 250));
      return sendJson(res, 201, { ok: true, lead });
    } catch (error) {
      return sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Failed to store lead',
      });
    }
  }

  return sendJson(res, 404, { error: 'not found' });
});

server.listen(port, host, async () => {
  await ensureDataStore();
  console.log(`${appName} listening on http://${host}:${port}`);
});
