import test from 'node:test';
import assert from 'node:assert/strict';

import { advanceDnpSimulation } from './simulation';
import type { DnpPublicRoom } from './domain';

const baseRoom: DnpPublicRoom = {
  code: 'ABC234', mode: 'private', status: 'playing', version: 1, adminPlayerId: 'p1',
  scores: { left: 0, right: 0 }, ball: { x: 0.5, y: 0.5, vx: 0.4, vy: 0.1 },
  players: [{ id: 'p1', name: 'Ada', joinOrder: 1, slotIndex: 0, isAdmin: true, online: true, input: 0.5, inputSeq: 0 }],
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

test('simulation consumes elapsed time beyond MAX_STEPS instead of freezing', () => {
  const oneSecond = advanceDnpSimulation({ ...baseRoom, ball: { x: 0.5, y: 0.5, vx: 0.1, vy: 0.05 } }, 1_000);
  const twoSeconds = advanceDnpSimulation({ ...baseRoom, ball: { x: 0.5, y: 0.5, vx: 0.1, vy: 0.05 } }, 2_000);

  assert.notDeepEqual(twoSeconds.ball, oneSecond.ball);
});

test('seven-day catch-up performs bounded detailed simulation work and still advances state', () => {
  let steps = 0;
  const advanced = advanceDnpSimulation(
    { ...baseRoom, ball: { x: 0.5, y: 0.5, vx: 0.1, vy: 0.05 } },
    7 * 24 * 60 * 60 * 1_000,
    { onStep: () => { steps += 1; } },
  );

  assert.ok(steps > 0);
  assert.ok(steps <= 150);
  assert.notDeepEqual(advanced.ball, baseRoom.ball);
});
