import test from 'node:test';
import assert from 'node:assert/strict';

import { DnpSocketTransport, isDnpPublicRoom, shouldSendSocketInput } from './multiplayer-socket';

class FakeSocket {
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  listeners = new Map<string, Array<(event: any) => void>>();
  constructor(public url: string) {}
  addEventListener(name: string, fn: (event: any) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]); }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; this.emit('close', {}); }
  emit(name: string, event: any) { for (const fn of this.listeners.get(name) ?? []) fn(event); }
}

const roomFor = (inputSeq = 0) => ({ code: 'ABC234', mode: 'private', status: 'lobby', version: 1, adminPlayerId: null, scores: { left: 0, right: 0 }, ball: { x: .5, y: .5, vx: .4, vy: .1 }, players: [{ id: 'p1', name: 'One', joinOrder: 1, slotIndex: 0, isAdmin: false, online: true, input: .5, inputSeq }] } as any);

test('authenticates in the first WebSocket message and consumes ordered snapshots', async () => {
  let socket!: FakeSocket;
  const snapshots: number[] = [];
  const transport = new DnpSocketTransport({
    code: 'ABC234', token: 'long-lived',
    fetchTicket: async () => ({ url: 'wss://example.test/rooms/ABC234', ticket: 'short-lived' }),
    createSocket: (url) => (socket = new FakeSocket(url) as any),
    onSnapshot: (_room, seq) => snapshots.push(seq),
  });
  const connecting = transport.start();
  await Promise.resolve();
  socket.readyState = 1; socket.emit('open', {});
  await connecting;
  assert.deepEqual(JSON.parse(socket.sent[0]), { type: 'auth', ticket: 'short-lived' });
  const room = { code: 'ABC234', mode: 'private', status: 'lobby', version: 1, adminPlayerId: null, scores: { left: 0, right: 0 }, ball: { x: .5, y: .5, vx: .4, vy: .1 }, players: [] };
  socket.emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 2, room }) });
  socket.emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 1, room }) });
  assert.deepEqual(snapshots, [2]);
  transport.stop();
});

test('socket input is bounded to changed values', () => {
  assert.equal(shouldSendSocketInput(null, .5), true);
  assert.equal(shouldSendSocketInput(.5, .501), false);
  assert.equal(shouldSendSocketInput(.5, .51), true);
});

test('validates the complete public-room shape before proving realtime', async () => {
  assert.equal(isDnpPublicRoom(roomFor()), true);
  assert.equal(isDnpPublicRoom({ ...roomFor(), ball: { x: .5, y: .5, vx: 'fast', vy: .1 } }), false);
  assert.equal(isDnpPublicRoom({ ...roomFor(), players: [{ ...roomFor().players[0], online: 'yes' }] }), false);
  const socket = new FakeSocket('wss://example.test');
  const states: string[] = [];
  const snapshots: number[] = [];
  const delays: number[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token',
    fetchTicket: async () => ({ url: socket.url, ticket: 'ticket' }), createSocket: () => socket as any,
    scheduleRetry: (_callback, delay) => { delays.push(delay); return 0 as any; },
    onSnapshot: (_room, seq) => snapshots.push(seq), onState: state => states.push(state),
  });
  void transport.start(); await Promise.resolve(); socket.readyState = 1; socket.emit('open', {});
  socket.emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 1, room: { ...roomFor(), scores: { left: 0 } } }) });
  assert.deepEqual(snapshots, []);
  assert.equal(states.at(-1), 'fallback');
  assert.equal(socket.readyState, 3);
  assert.equal(delays.length, 1);
  assert.equal(transport.sendInput(.7, 1000), false);
  transport.stop();
});

test('socket input sequence is strictly above locally issued and in-flight HTTP input', async () => {
  const socket = new FakeSocket('wss://example.test');
  let highWater = 17;
  const issued: number[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', playerId: 'p1',
    getInputSequenceHighWater: () => highWater,
    onInputSequenceIssued: seq => { highWater = seq; issued.push(seq); },
    fetchTicket: async () => ({ url: socket.url, ticket: 'ticket' }), createSocket: () => socket as any, onSnapshot: () => {},
  });
  const starting = transport.start(); await Promise.resolve(); socket.readyState = 1; socket.emit('open', {}); await starting;
  socket.emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 1, room: roomFor(12) }) });
  assert.equal(transport.sendInput(.8, 1000), true);
  assert.equal(JSON.parse(socket.sent.at(-1)!).seq, 18);
  assert.deepEqual(issued, [18]);
  transport.stop();
});

test('start is idempotent and closes the prior socket before opening another', async () => {
  const sockets: FakeSocket[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token',
    fetchTicket: async () => ({ url: 'wss://example.test', ticket: 'ticket' }),
    createSocket: url => { const socket = new FakeSocket(url); sockets.push(socket); return socket as any; }, onSnapshot: () => {},
  });
  void transport.start(); await Promise.resolve(); sockets[0].readyState = 1; sockets[0].emit('open', {});
  void transport.start(); await Promise.resolve();
  assert.equal(sockets[0].readyState, 3);
  assert.equal(sockets.length, 2);
  transport.stop();
});

test('retry policy enters a slow capped circuit probe after configured failures', async () => {
  const delays: number[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', maxFailures: 2, circuitProbeMs: 60_000,
    reconnectDelaysMs: [100, 200], fetchTicket: async () => { throw Object.assign(new Error('gateway'), { retryable: true }); },
    scheduleRetry: (_callback, delay) => { delays.push(delay); return 0 as any; }, onSnapshot: () => {},
  });
  await transport.start();
  await transport.retryNowForTest();
  await transport.retryNowForTest();
  assert.deepEqual(delays, [100, 60_000, 60_000]);
  transport.stop();
});

test('reconnect starts a new snapshot epoch and initializes input sequence from own snapshot', async () => {
  const sockets: FakeSocket[] = [];
  const snapshots: number[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', playerId: 'p1', reconnectDelaysMs: [0],
    fetchTicket: async () => ({ url: 'wss://example.test/rooms/ABC234', ticket: 'ticket' }),
    createSocket: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket as any; },
    onSnapshot: (_room, seq) => snapshots.push(seq), maxFailures: 3,
  });
  const starting = transport.start(); await Promise.resolve(); sockets[0].readyState = 1; sockets[0].emit('open', {});
  sockets[0].emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 50, room: roomFor(40) }) }); await starting;
  assert.equal(transport.sendInput(.7, 1000), true); assert.equal(JSON.parse(sockets[0].sent.at(-1)!).seq, 41);
  sockets[0].emit('close', {}); await new Promise((resolve) => setTimeout(resolve, 5));
  sockets[1].readyState = 1; sockets[1].emit('open', {});
  sockets[1].emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 1, room: roomFor(45) }) });
  assert.deepEqual(snapshots, [50, 1]);
  assert.equal(transport.sendInput(.8, 2000), true); assert.equal(JSON.parse(sockets[1].sent.at(-1)!).seq, 46);
  transport.stop();
});

test('error and close schedule only one reconnect', async () => {
  const sockets: FakeSocket[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', reconnectDelaysMs: [0],
    fetchTicket: async () => ({ url: 'wss://example.test/rooms/ABC234', ticket: 'ticket' }),
    createSocket: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket as any; }, onSnapshot: () => {}, maxFailures: 3,
  });
  void transport.start(); await Promise.resolve();
  sockets[0].emit('error', {}); sockets[0].emit('close', {}); await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(sockets.length, 2); transport.stop();
});

test('connection watchdog falls back when no socket snapshot arrives', async () => {
  const socket = new FakeSocket('wss://example.test');
  const states: string[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', watchdogMs: 5, maxFailures: 1,
    fetchTicket: async () => ({ url: socket.url, ticket: 'ticket' }), createSocket: () => socket as any,
    onSnapshot: () => {}, onState: (state) => states.push(state),
  });
  void transport.start(); await Promise.resolve(); socket.readyState = 1; socket.emit('open', {});
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(states.at(-1), 'fallback'); transport.stop();
});

test('snapshot watchdog rearms and falls back when an established realtime socket becomes silent', async () => {
  const socket = new FakeSocket('wss://example.test');
  const states: string[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', watchdogMs: 10, maxFailures: 1,
    fetchTicket: async () => ({ url: socket.url, ticket: 'ticket' }), createSocket: () => socket as any,
    onSnapshot: () => {}, onState: (state) => states.push(state),
  });
  void transport.start(); await Promise.resolve(); socket.readyState = 1; socket.emit('open', {});
  socket.emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 1, room: roomFor() }) });
  await new Promise((resolve) => setTimeout(resolve, 5));
  socket.emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 2, room: roomFor() }) });
  await new Promise((resolve) => setTimeout(resolve, 6));
  assert.equal(states.at(-1), 'realtime');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(states.at(-1), 'fallback'); assert.equal(socket.readyState,3);
  transport.stop();
});

// Reliability contract: HTTP remains primary until a valid snapshot proves realtime.
test('permanent ticket unavailability falls back after exactly one request', async () => {
  let requests = 0;
  const states: string[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', reconnectDelaysMs: [0],
    fetchTicket: async () => { requests++; return { available: false, reason: 'not_configured', retryable: false }; },
    onSnapshot: () => {}, onState: state => states.push(state),
  });
  await transport.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(requests, 1);
  assert.equal(states.at(-1), 'fallback');
  transport.stop();
});

test('first transient failure enables fallback immediately and quiet retry waits for snapshot before realtime', async () => {
  let requests = 0;
  const sockets: FakeSocket[] = [];
  const states: string[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', reconnectDelaysMs: [0],
    fetchTicket: async () => { requests++; if (requests === 1) throw Object.assign(new Error('gateway'), { retryable: true }); return { available: true, url: 'wss://example.test', ticket: 'ticket' }; },
    createSocket: url => { const socket = new FakeSocket(url); sockets.push(socket); return socket as any; },
    onSnapshot: () => {}, onState: state => states.push(state),
  });
  await transport.start();
  assert.equal(states.at(-1), 'fallback');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(requests, 2);
  assert.deepEqual(states, ['connecting', 'fallback']);
  sockets[0].readyState = 1; sockets[0].emit('open', {});
  assert.equal(states.at(-1), 'fallback');
  sockets[0].emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 1, room: roomFor() }) });
  assert.equal(states.at(-1), 'realtime');
  transport.stop();
});

test('socket loss returns to fallback immediately and stop cancels background retries', async () => {
  let requests = 0;
  const sockets: FakeSocket[] = [];
  const states: string[] = [];
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', reconnectDelaysMs: [30],
    fetchTicket: async () => { requests++; return { available: true, url: 'wss://example.test', ticket: 'ticket' }; },
    createSocket: url => { const socket = new FakeSocket(url); sockets.push(socket); return socket as any; },
    onSnapshot: () => {}, onState: state => states.push(state),
  });
  const starting = transport.start(); await Promise.resolve(); sockets[0].readyState = 1; sockets[0].emit('open', {}); await starting;
  sockets[0].emit('message', { data: JSON.stringify({ type: 'snapshot', seq: 1, room: roomFor() }) });
  sockets[0].emit('close', {});
  assert.equal(states.at(-1), 'fallback');
  transport.stop();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(requests, 1);
});

test('default ticket fetch classifies non-JSON gateways and honors Retry-After on 429', async () => {
  const originalFetch = globalThis.fetch;
  const delays: number[] = [];
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    if (requests === 1) return new Response('<html>bad gateway</html>', { status: 503, headers: { 'content-type': 'text/html' } });
    return new Response('rate limited', { status: 429, headers: { 'retry-after': '2' } });
  }) as typeof fetch;
  const transport = new DnpSocketTransport({ code: 'ABC234', token: 'token', reconnectDelaysMs: [0],
    scheduleRetry: (_fn, delay) => { delays.push(delay); return 0 as any; }, onSnapshot: () => {},
  });
  try {
    await transport.start();
    assert.equal(delays[0], 0);
    await transport.retryNowForTest();
    assert.equal(delays[1], 2000);
  } finally { transport.stop(); globalThis.fetch = originalFetch; }
});

test('DnpGame keeps HTTP polling active in every state except proven realtime', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('./DnpGame.tsx', import.meta.url), 'utf8'));
  assert.match(source, /realtimeProven\s*=\s*connectionState\s*===\s*'realtime'/);
  assert.match(source, /!sessionCode\s*\|\|\s*!sessionToken\s*\|\|\s*realtimeProven/);
  assert.doesNotMatch(source, /connectionState\s*!==\s*'fallback'/);
});
