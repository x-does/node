import test from 'node:test';
import assert from 'node:assert/strict';

import { DnpSocketTransport, shouldSendSocketInput } from './multiplayer-socket';

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
