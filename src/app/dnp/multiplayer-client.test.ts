import test from 'node:test';
import assert from 'node:assert/strict';

import type { DnpPublicRoom } from '@/lib/dnp/domain';
import {
  applyLocalDnpInput,
  clampDnpInput,
  DNP_INPUT_INTERVAL_MS,
  DNP_POLL_INTERVAL_MS,
  acknowledgeDnpInput,
  initializeDnpInputSequence,
  queueDnpInput,
  projectDnpRoom,
  shouldAcceptDnpResponse,
  shouldSendDnpInput,
} from './multiplayer-client';

const room = (): DnpPublicRoom => ({
  code: 'ABC234',
  mode: 'private',
  status: 'playing',
  version: 4,
  adminPlayerId: 'p1',
  scores: { left: 0, right: 0 },
  ball: { x: 0.5, y: 0.5, vx: 0.42, vy: 0.17 },
  players: [{ id: 'p1', name: 'One', joinOrder: 1, slotIndex: 0, isAdmin: true, online: true, input: 0.5, inputSeq: 3 }],
});

test('clamps local paddle movement to normalized arena bounds', () => {
  assert.equal(clampDnpInput(-0.2), 0);
  assert.equal(clampDnpInput(1.2), 1);
  assert.equal(clampDnpInput(0.6), 0.6);
});

test('sends input only when absolute position changed enough', () => {
  assert.equal(shouldSendDnpInput(0.5, 0.503), false);
  assert.equal(shouldSendDnpInput(0.5, 0.51), true);
  assert.equal(shouldSendDnpInput(null, 0.5), true);
});

test('projects a playing snapshot and local input without mutating the authoritative room', () => {
  const authoritative = room();
  const projected = projectDnpRoom(applyLocalDnpInput(authoritative, 'p1', 0.8), 100);

  assert.equal(authoritative.players[0].input, 0.5);
  assert.equal(authoritative.ball.x, 0.5);
  assert.equal(projected.players[0].input, 0.8);
  assert.notEqual(projected.ball.x, authoritative.ball.x);
});

test('rejects responses older than the latest applied request order', () => {
  assert.equal(shouldAcceptDnpResponse('ABC234', 4, 8, room(), 7), false);
  assert.equal(shouldAcceptDnpResponse('ABC234', 4, 8, room(), 8), true);
  assert.equal(shouldAcceptDnpResponse('ABC234', 4, 8, room(), 9), true);
  assert.equal(shouldAcceptDnpResponse('ABC234', 5, 8, room(), 9), false);
  assert.equal(shouldAcceptDnpResponse('ABC234', 3, 8, room(), 7), true);
});

test('rejects a late response belonging to a previous room session', () => {
  assert.equal(shouldAcceptDnpResponse('XYZ789', 0, 0, room(), 99), false);
});

test('failed input delivery retries the same position and sequence until acknowledged', () => {
  const initial = { acknowledgedPosition: 0.5, sequence: 4, pending: null };
  const queued = queueDnpInput(initial, 0.8);
  const retried = queueDnpInput(queued, 0.9);

  assert.deepEqual(queued.pending, { position: 0.8, seq: 5 });
  assert.deepEqual(retried.pending, { position: 0.8, seq: 5 });
  assert.equal(retried.acknowledgedPosition, 0.5);

  const acknowledged = acknowledgeDnpInput(retried, 5);
  assert.equal(acknowledged.acknowledgedPosition, 0.8);
  assert.equal(acknowledged.sequence, 5);
  assert.equal(acknowledged.pending, null);
});

test('reconnect sequence initializes and only increases from server snapshots', () => {
  assert.equal(initializeDnpInputSequence(0, room(), 'p1'), 3);
  assert.equal(initializeDnpInputSequence(8, room(), 'p1'), 8);
  assert.equal(initializeDnpInputSequence(8, room(), 'missing'), 8);
});

test('projection continues advancing beyond the simulation step window', () => {
  const projectedAtOneSecond = projectDnpRoom(room(), 1_000);
  const projectedAtTwoSeconds = projectDnpRoom(room(), 2_000);

  assert.notDeepEqual(projectedAtTwoSeconds.ball, projectedAtOneSecond.ball);
});

test('network cadence is bounded to five inputs and two polls per second', () => {
  assert.ok(DNP_INPUT_INTERVAL_MS >= 200);
  assert.ok(DNP_POLL_INTERVAL_MS >= 500);
});
