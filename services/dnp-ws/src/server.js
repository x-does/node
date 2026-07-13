import http from 'node:http';
import { WebSocketServer } from 'ws';
import { verifyTicket, TicketNonceStore } from './ticket.js';
import { RoomHub } from './room-hub.js';

const reject = (socket, status = '403 Forbidden') => {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
};
const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const decrement = (map, key) => map.set(key, Math.max(0, (map.get(key) ?? 1) - 1));
const withTimeout = (promise, ms, timeoutValue, reject = false) => new Promise((resolve, rejectPromise) => {
  const timer = setTimeout(() => reject ? rejectPromise(timeoutValue) : resolve(timeoutValue), ms);
  Promise.resolve(promise).then(
    value => { clearTimeout(timer); resolve(value); },
    error => { clearTimeout(timer); rejectPromise(error); },
  );
});

export function createHubRegistry({ adapter, idleMs, hubOptions }) {
  const hubs = new Map();
  return {
    hubs,
    async get(code) {
      const existing = hubs.get(code);
      if (existing) return existing;
      const promise = new RoomHub(code, adapter, (key, hub) => this.delete(key, hub), idleMs, hubOptions).init();
      hubs.set(code, promise);
      try {
        const hub = await promise;
        if (hubs.get(code) === promise) hubs.set(code, hub);
        return hub;
      } catch (error) {
        if (hubs.get(code) === promise) hubs.delete(code);
        throw error;
      }
    },
    delete(code, hub) {
      if (hubs.get(code) === hub) hubs.delete(code);
    },
  };
}

export function createDnpWsServer({
  adapter, secret, allowedOrigins, idleMs = 30000, maxPayload = 8192, authTimeoutMs = 5000,
  maxSockets = 1000, maxRoomSockets = 100, maxPlayerSockets = 3, maxPendingAuth = 100,
  readyTimeoutMs = 1000, readyCacheMs = 1000, shutdownTimeoutMs = 10000,
  hubOptions = {},
}) {
  const registry = createHubRegistry({ adapter, idleMs, hubOptions });
  const nonces = new TicketNonceStore();
  const roomCounts = new Map(), playerCounts = new Map();
  let pendingAuth = 0;
  let closing = false, closePromise = null;
  let readyCheck = null, readyCache = null;
  const readiness = () => {
    const now = Date.now();
    if (readyCache && readyCache.expiresAt > now) return Promise.resolve(readyCache.value);
    if (readyCheck) return readyCheck;
    readyCheck = withTimeout(
      Promise.resolve().then(() => adapter.ready()).then(Boolean).catch(() => false),
      readyTimeoutMs,
      false,
    ).then(value => {
      readyCache = { value, expiresAt: Date.now() + readyCacheMs };
      return value;
    }).finally(() => { readyCheck = null; });
    return readyCheck;
  };

  const server = http.createServer(async (req, res) => {
    if (closing) {
      res.writeHead(503, { connection: 'close' }); res.end();
      return;
    }
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, service: 'dnp-ws' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/readyz') {
      const ready = await readiness();
      res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: ready, service: 'dnp-ws', database: ready ? 'ready' : 'unavailable' }));
      return;
    }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload });

  server.on('upgrade', (req, socket, head) => {
    if (closing) { reject(socket, '503 Service Unavailable'); return; }
    let path;
    try { path = new URL(req.url, 'http://local').pathname; } catch { reject(socket); return; }
    const match = path.match(/^\/rooms\/([A-Z2-9]{6})$/);
    const code = match?.[1];
    if (!code || !allowedOrigins.includes(req.headers.origin)) { reject(socket); return; }
    if (wss.clients.size >= maxSockets || pendingAuth >= maxPendingAuth || (roomCounts.get(code) ?? 0) >= maxRoomSockets) {
      reject(socket, '503 Service Unavailable'); return;
    }
    pendingAuth += 1;
    increment(roomCounts, code); // reserve room capacity before authentication
    wss.handleUpgrade(req, socket, head, ws => {
      if (closing) {
        pendingAuth = Math.max(0, pendingAuth - 1);
        decrement(roomCounts, code);
        ws.terminate();
        return;
      }
      wss.emit('connection', ws, req, code);
    });
  });

  wss.on('connection', (ws, _req, code) => {
    let hub = null, authState = 'pending', isAlive = true, playerKey = null, pending = true, playerReserved = false;
    const releasePending = () => {
      if (!pending) return;
      pending = false; pendingAuth = Math.max(0, pendingAuth - 1);
    };
    const releaseCapacity = () => {
      decrement(roomCounts, code);
      if (playerReserved) { decrement(playerCounts, playerKey); playerReserved = false; }
    };
    const authTimer = setTimeout(() => ws.close(4401, 'authentication required'), authTimeoutMs);
    ws.on('pong', () => { isAlive = true; });
    const handleMessage = async data => {
      if (data.length > maxPayload) { ws.close(4400, 'payload too large'); return; }
      let msg;
      try { msg = JSON.parse(String(data)); } catch { ws.close(4400, 'invalid json'); return; }
      if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || Object.getPrototypeOf(msg) !== Object.prototype) {
        ws.close(4400, 'invalid message'); return;
      }
      if (authState !== 'authed') {
        if (authState === 'authenticating' || authState === 'closed') return;
        if (closing) { releasePending(); ws.close(1012, 'server shutting down'); return; }
        const claims = msg.type === 'auth' && verifyTicket(msg.ticket, secret, code);
        if (!claims || !nonces.consume(claims)) { releasePending(); ws.close(4401, 'invalid or replayed ticket'); return; }
        authState = 'authenticating';
        playerKey = `${code}:${claims.playerId}`;
        if ((playerCounts.get(playerKey) ?? 0) >= maxPlayerSockets) { releasePending(); ws.close(4429, 'player socket limit'); return; }
        increment(playerCounts, playerKey); playerReserved = true;
        try {
          const loadedHub = await registry.get(code);
          if (authState === 'closed' || ws.readyState !== 1) return;
          if (!loadedHub.add(ws, claims)) { releasePending(); ws.close(4403, 'inactive player'); return; }
          hub = loadedHub; authState = 'authed'; releasePending(); clearTimeout(authTimer); hub.broadcastNow();
        } catch {
          if (authState !== 'closed') { releasePending(); ws.close(4404, 'room unavailable'); }
        }
        return;
      }
      if (msg.type === 'input') hub.input(ws, msg);
      else if (msg.type === 'admin') await hub.admin(ws, msg).catch(() => ws.close(4409, 'admin sync failed'));
      else if (msg.type === 'sync') await hub.syncExternal(true).catch(() => ws.close(4409, 'sync failed'));
    };
    ws.on('message', data => {
      handleMessage(data).catch(() => {
        if (authState !== 'closed') ws.close(1011, 'message handling failed');
      });
    });
    ws.on('close', () => {
      authState = 'closed'; clearTimeout(authTimer); releasePending(); hub?.remove(ws); releaseCapacity();
    });
    ws.on('error', () => {});
    ws._heartbeat = () => { if (!isAlive) { ws.terminate(); return; } isAlive = false; ws.ping(); };
  });

  const heartbeat = setInterval(() => { for (const ws of wss.clients) ws._heartbeat?.(); }, 15000);
  return {
    server,
    registry: registry.hubs,
    close() {
      if (closePromise) return closePromise;
      closing = true;
      clearInterval(heartbeat);
      const serverClosed = server.listening
        ? new Promise(resolve => server.close(resolve))
        : Promise.resolve();
      for (const ws of wss.clients) ws.terminate();
      const cleanup = (async () => {
        const errors = [];
        for (const value of registry.hubs.values()) {
          try { const hub = await value; await hub.shutdown(); } catch (error) { errors.push(error); }
        }
        await serverClosed;
        try { await adapter.close?.(); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'failed to close dnp-ws server cleanly');
      })();
      closePromise = withTimeout(cleanup, shutdownTimeoutMs, new Error('dnp-ws shutdown timed out'), true);
      return closePromise;
    },
  };
}
