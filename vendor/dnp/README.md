# DefinitelyNotPong

DefinitelyNotPong is a Node 22+ realtime browser game built with native ESM, Express, `ws`, and `nanoid`. It does not use a frontend framework, a bundler, Python, or a database.

The application must run as a Node server because gameplay uses WebSockets. Static hosting can serve files, but it cannot host the realtime game server by itself.

## Requirements

- Node.js 22 or newer
- npm
- A browser with WebSocket support

## Project scripts

```bash
npm run dev            # start the server with node --watch
npm start              # start the server normally
npm run serve:static   # serve ./client only; useful for inspecting static files, not full gameplay
npm run create-site    # local preflight helper; creates .env.example and deployment notes
npm run deploy         # Hostinger/Node deployment guidance and preflight helper
npm run pixel-summary  # summarize static assets under ./client
```

## Local development

Install dependencies:

```bash
npm install
```

Start the app in watch mode:

```bash
npm run dev
```

Or start it normally:

```bash
npm start
```

By default the server listens on `0.0.0.0:8080`. Open:

```text
http://localhost:8080
```

If you need a different port:

```bash
PORT=3000 npm run dev
```

On Windows PowerShell:

```powershell
$env:PORT=3000; npm run dev
```

## Static-only caveat

`npm run serve:static` serves only the `client/` directory. This can be useful for checking HTML, CSS, images, or client-side JavaScript, but it is not a complete game deployment.

The multiplayer/realtime parts require the Node server and WebSocket endpoint. Do not deploy only static files by FTP and expect gameplay to work.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | unset | Set to `production` for deployed environments. |
| `HOST` | `0.0.0.0` | Interface the Node server binds to. Use `0.0.0.0` for containers/VPS/LAN sharing. |
| `PORT` | `8080` | HTTP/WebSocket port. Many managed hosts provide this automatically. |
| `ALLOWED_ORIGINS` | empty | Optional comma-separated list of browser origins allowed to connect, such as `https://example.com,https://www.example.com`. Leave empty for local testing only. |
| `BASE_PATH` | empty | Optional mount path such as `/dnp`. Leave empty for standalone root deployment; set to `/dnp` when the app is mounted inside `x-does/node`. |

For local configuration, copy `.env.example` to `.env` after running `npm run create-site`, or create `.env` manually.

## Docker

Build and run with Docker:

```bash
docker build -t definitely-not-pong .
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=8080 \
  definitely-not-pong
```

Then open:

```text
http://localhost:8080
```

To test the mounted form locally, run with `BASE_PATH=/dnp` and open `http://localhost:8080/dnp`:

```bash
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=8080 \
  -e BASE_PATH=/dnp \
  definitely-not-pong
```

With Docker Compose:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f pong
```

Stop:

```bash
docker compose down
```

## LAN sharing

Because the default host is `0.0.0.0`, other devices on the same network can connect if your firewall allows the port.

1. Start the server:

   ```bash
   npm run dev
   ```

2. Find your computer's LAN IP address.
   - macOS/Linux: `ip addr` or `ifconfig`
   - Windows: `ipconfig`

3. From another device on the same network, open:

   ```text
   http://YOUR-LAN-IP:8080
   ```

If connections fail, check OS firewall rules and ensure both devices are on the same network.

## Hostinger deployment guidance

Use a hosting option that can run a long-lived Node process and supports WebSocket upgrades.

### Option A: Hostinger Node.js application hosting

Use this when your plan includes Node.js app hosting.

Recommended settings:

- Node version: 22 or newer
- Application root: the project directory
- Install command: `npm ci --omit=dev`
- Start command: `npm start`
- Environment variables:
  - `NODE_ENV=production`
  - `HOST=0.0.0.0`
  - `PORT` set to the value required/provided by the Hostinger panel, if applicable
  - `ALLOWED_ORIGINS` set to your deployed `https://` origin or origins

Do not hard-code domains in the source. Configure production origins through `ALLOWED_ORIGINS`.

### Option B: Hostinger VPS

Use a VPS when you want full control over Node, Docker, TLS, and reverse proxy configuration.

Typical Node process setup:

```bash
npm ci --omit=dev
NODE_ENV=production HOST=0.0.0.0 PORT=8080 npm start
```

Typical Docker setup:

```bash
docker compose up -d --build
```

Put a reverse proxy such as Nginx, Caddy, or Apache in front of the app for HTTPS. Ensure the proxy passes WebSocket upgrade headers (`Upgrade` and `Connection`) to the Node server.

### Do not use static-only FTP hosting

Static FTP hosting is not sufficient for DefinitelyNotPong. It cannot run `server/index.mjs`, cannot keep WebSocket connections open, and cannot coordinate realtime game rooms. Uploading only `client/` may show a page, but the game server will be missing.

## Vendoring into `x-does/node`

DNP can also be pulled into the main XDOES Node/Next app and mounted at `/dnp` instead of running as a separate public process.

The reusable server entrypoint exports `createDefinitelyNotPongServer(options)` from `server/index.mjs`:

```js
import { createDefinitelyNotPongServer } from './vendor/dnp/server/index.mjs';

const instance = createDefinitelyNotPongServer({
  app: expressOrCompatibleApp,
  server: existingHttpServer,
  basePath: '/dnp',
});
```

When mounted this way:

- static game pages are served below `/dnp`
- WebSocket clients connect to `/dnp/ws`
- invite links use `/dnp/join/:code`
- standalone Docker/root deployment still works with no `BASE_PATH`

## Deployment helpers

The helper scripts are intentionally safe and non-destructive:

```bash
npm run create-site
npm run deploy
npm run pixel-summary
```

They do not upload files, modify DNS, or call provider APIs. They provide preflight checks, deployment notes, and static asset summaries using Node only.

## Notes

- No database is required; game state is in memory.
- Restarting the server clears active rooms.
- Run behind HTTPS in production so browser WebSocket connections use secure `wss://` when the page is served over `https://`.
