import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

import { config } from './config.mjs';
import { cleanupStaleRooms, rooms, broadcast } from './room-manager.mjs';
import { attachProtocol } from './protocol.mjs';
import { logger } from './utils/logger.mjs';
import { serializeGameState, updateGame } from './game/state.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '../client');
const indexHtml = path.join(clientDir, 'index.html');

function normalizeBasePath(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

function route(basePath, suffix = '') {
  const base = normalizeBasePath(basePath);
  if (!suffix || suffix === '/') return base || '/';
  return `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

function originAllowed(origin, allowedOrigins) {
  if (allowedOrigins.length === 0) return true;
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

function defaultAllowedOrigins() {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) return configuredOrigins;
  if (process.env.NODE_ENV === 'production') return ['https://node.xdoes.space'];
  return [];
}

function resolveAllowedOrigins(optionAllowedOrigins) {
  if (Array.isArray(optionAllowedOrigins)) return optionAllowedOrigins;
  return defaultAllowedOrigins();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function createDefinitelyNotPongServer(options = {}) {
  const app = options.app || express();
  const server = options.server || http.createServer(app);
  const basePath = normalizeBasePath(options.basePath ?? config.basePath);
  const wsPath = route(basePath, '/ws');
  const allowedOrigins = resolveAllowedOrigins(options.allowedOrigins);
  config.basePath = basePath;

  const wss = new WebSocketServer({
    server,
    path: wsPath,
    maxPayload: 4096,
    verifyClient: ({ origin }, done) => {
      if (originAllowed(origin, allowedOrigins)) return done(true);
      return done(false, 403, 'Forbidden origin');
    },
  });

  attachProtocol(wss);

  app.disable?.('x-powered-by');

  app.get(route(basePath, '/config.js'), (_req, res) => {
    res
      .type('application/javascript')
      .set('Cache-Control', 'no-store')
      .send(`window.DNP_CONFIG=${JSON.stringify({ basePath, wsPath })};`);
  });

  app.get(route(basePath, '/healthz'), (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, clients: wss.clients.size, basePath, wsPath });
  });

  app.get(route(basePath, '/join/:code'), (req, res) => {
    res.sendFile(path.join(clientDir, 'join.html'), (err) => {
      if (err) {
        const code = escapeHtml(String(req.params.code).toUpperCase());
        res.type('html').send(`<!doctype html><html><head><title>DefinitelyNotPong</title></head><body><main><h1>DefinitelyNotPong</h1><p>Join code: <strong>${code}</strong></p></main></body></html>`);
      }
    });
  });

  app.use(route(basePath, '/'), express.static(clientDir, { extensions: ['html'], fallthrough: true }));

  app.get(route(basePath, '/'), (_req, res) => {
    res.sendFile(indexHtml, (err) => {
      if (err) {
        res.type('html').send('<!doctype html><html><head><title>DefinitelyNotPong</title></head><body><main><h1>DefinitelyNotPong</h1><p>Server is running.</p></main></body></html>');
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const socket of wss.clients) {
      const session = socket._dnpSession;
      if (session?.isAlive === false) {
        socket.terminate();
        continue;
      }
      if (session) session.isAlive = false;
      socket.ping();
    }
  }, 30_000);

  const cleanupInterval = setInterval(cleanupStaleRooms, config.roomCleanupMs);

  let lastTickAt = Date.now();
  const tickInterval = setInterval(() => {
    const timestamp = Date.now();
    const dtMs = Math.min(100, timestamp - lastTickAt);
    lastTickAt = timestamp;

    for (const room of rooms.values()) {
      if (room.status !== 'playing' || !room.game) continue;
      updateGame(room, dtMs);
      const game = serializeGameState(room);
      broadcast(room, { type: 'game_state', ...game, game });
    }
  }, Math.max(1, Math.floor(1000 / config.tickRate)));

  function shutdown(callback) {
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
    clearInterval(tickInterval);
    wss.close(() => {
      if (options.server) return callback?.();
      server.close(() => callback?.());
    });
  }

  return { app, server, wss, basePath, wsPath, shutdown };
}

function isEntrypoint() {
  return import.meta.url === pathToFileURL(process.argv[1] || '').href;
}

if (isEntrypoint()) {
  const instance = createDefinitelyNotPongServer();

  function shutdown(signal) {
    logger.info(`${signal} received, shutting down`);
    instance.shutdown(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  instance.server.listen(config.port, config.host, () => {
    logger.info(`server listening on http://${config.host}:${config.port}${instance.basePath || '/'}`);
  });
}
