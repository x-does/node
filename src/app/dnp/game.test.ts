import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialDnpState,
  getAiPaddleTarget,
  getResponsiveArenaSize,
  movePlayerPaddle,
  stepDnpGame,
  type DnpInputState,
} from './game';

test('getResponsiveArenaSize keeps a 5:3 arena inside mobile and desktop bounds', () => {
  assert.deepEqual(getResponsiveArenaSize(360, 900), { width: 328, height: 197 });
  assert.deepEqual(getResponsiveArenaSize(1440, 900), { width: 1100, height: 660 });
});

test('movePlayerPaddle supports keyboard direction and clamps to the arena', () => {
  const state = createInitialDnpState(800, 480);
  const input: DnpInputState = { up: true, down: false, pointerY: null };

  const moved = movePlayerPaddle(state, input, 1);
  assert.ok(moved.player.y < state.player.y);

  const clampedTop = movePlayerPaddle({ ...state, player: { ...state.player, y: 4 } }, input, 1);
  assert.equal(clampedTop.player.y, 0);

  const pointerMoved = movePlayerPaddle(state, { up: false, down: false, pointerY: 300 }, 0.016);
  assert.equal(pointerMoved.player.y, 300 - state.player.height / 2);
});

test('getAiPaddleTarget tracks the ball with a small predictive lead', () => {
  const state = createInitialDnpState(800, 480);
  const target = getAiPaddleTarget({ ...state, ball: { ...state.ball, y: 120, vy: 90 } });

  assert.equal(target, 138);
});

test('stepDnpGame bounces the ball off the player paddle and speeds up rallies', () => {
  const state = createInitialDnpState(800, 480);
  const stepped = stepDnpGame(
    {
      ...state,
      paused: false,
      player: { ...state.player, y: 180 },
      ball: { ...state.ball, x: 41, y: 230, vx: -360, vy: 0, radius: 8, speed: 360 },
    },
    { up: false, down: false, pointerY: null },
    0.016,
  );

  assert.ok(stepped.ball.vx > 0);
  assert.ok(stepped.ball.speed > 360);
  assert.equal(stepped.message, 'Nice return.');
});

test('stepDnpGame scores, resets the ball, and pauses after a point', () => {
  const state = createInitialDnpState(800, 480);
  const scored = stepDnpGame(
    {
      ...state,
      paused: false,
      ball: { ...state.ball, x: -10, y: 200, vx: -360, vy: 0 },
    },
    { up: false, down: false, pointerY: null },
    0.016,
  );

  assert.equal(scored.aiScore, 1);
  assert.equal(scored.playerScore, 0);
  assert.equal(scored.paused, true);
  assert.equal(scored.message, 'AI scores. Press resume.');
  assert.equal(scored.ball.x, 400);
  assert.equal(scored.ball.y, 240);
});
