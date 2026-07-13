import test from 'node:test';
import assert from 'node:assert/strict';

import { advanceDnpSimulation } from './simulation';
import type { DnpPublicRoom } from './domain';

const baseRoom: DnpPublicRoom = {
  code: 'ABC234', mode: 'private', status: 'playing', version: 1, adminPlayerId: 'p1',
  scores: { left: 0, right: 0 }, ball: { x: 0.5, y: 0.5, vx: 0.4, vy: 0.1 },
  players: [{ id: 'p1', name: 'Ada', joinOrder: 1, slotIndex: 0, isAdmin: true, online: true, input: 0.5 }],
};

test('advances multiplayer ball when playing', () => {
  const advanced = advanceDnpSimulation(baseRoom, 500);
  assert.ok(advanced.ball.x > baseRoom.ball.x);
});

test('scores for opposite half when ball escapes a side boundary', () => {
  const scored = advanceDnpSimulation({ ...baseRoom, ball: { x: -0.02, y: 0.5, vx: -0.4, vy: 0 } }, 100);
  assert.equal(scored.scores.right, 1);
  assert.ok(scored.ball.x > 0.49 && scored.ball.x < 0.56);
});

test('side paddle collision reflects toward opposite half', () => {
  const bounced = advanceDnpSimulation({ ...baseRoom, ball: { x: 0.05, y: 0.5, vx: -0.2, vy: 0 } }, 80);
  assert.ok(bounced.ball.vx > 0);
});
