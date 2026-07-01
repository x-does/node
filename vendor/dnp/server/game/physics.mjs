import { gameConstants, config } from '../config.mjs';
import { clamp, paddleRect, teamForSlot } from './layout.mjs';

const TWO_PI = Math.PI * 2;

export function makeBall(servingTeam = Math.random() < 0.5 ? 'left' : 'right') {
  const speed = gameConstants.ballBaseSpeed;
  const towardLeft = servingTeam === 'left';
  const hash = Math.sin((servingTeam === 'left' ? 13.37 : 29.91) + Date.now() * 0.001) * 43758.5453;
  const fraction = hash - Math.floor(hash);
  const angle = (fraction * 0.44 - 0.22);
  return {
    x: config.arena.width / 2,
    y: config.arena.height / 2,
    radius: gameConstants.ballRadius,
    r: gameConstants.ballRadius,
    vx: (towardLeft ? -1 : 1) * Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    speed,
    lastHitPaddleId: null,
    lastHitAt: -Infinity,
  };
}

export function movePaddles(game, dtSec) {
  for (const paddle of game.paddles) {
    const direction = clamp(Number(paddle.inputDirection || 0), -1, 1);
    const maxMove = paddle._maxMoveThisTick ?? gameConstants.paddleSpeed * dtSec;
    const delta = direction * maxMove;
    paddle.position = clamp(paddle.position + delta, paddle._boundsMin, paddle._boundsMax);
    if (paddle.axis === 'y') paddle.y = paddle.position;
    else paddle.x = paddle.position;
    paddle._maxMoveThisTick = undefined;
  }
}

function overlapCircleAabb(ball, rect) {
  const closestX = clamp(ball.x, rect.left, rect.right);
  const closestY = clamp(ball.y, rect.top, rect.bottom);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  return dx * dx + dy * dy <= ball.radius * ball.radius;
}

function speedOf(ball) {
  return Math.hypot(ball.vx, ball.vy) || gameConstants.ballBaseSpeed;
}

function setSpeed(ball, angle, signX) {
  const nextSpeed = Math.min(gameConstants.ballMaxSpeed, speedOf(ball) * gameConstants.ballAccel);
  ball.speed = nextSpeed;
  ball.vx = signX * Math.cos(angle) * nextSpeed;
  ball.vy = Math.sin(angle) * nextSpeed;
}

function reflectVerticalPaddle(ball, paddle) {
  const rect = paddleRect(paddle);
  const relative = clamp((ball.y - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1);
  const maxAngle = Math.PI * 0.36;
  const signX = paddle.slot === 'left_side' ? 1 : -1;
  setSpeed(ball, relative * maxAngle, signX);
  ball.x = signX > 0 ? rect.right + ball.radius : rect.left - ball.radius;
}

function reflectHorizontalPaddle(ball, paddle) {
  const rect = paddleRect(paddle);
  const relative = clamp((ball.x - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1);
  const maxAngle = Math.PI * 0.36;
  const signY = String(paddle.slot).includes('_top') ? 1 : -1;
  const nextSpeed = Math.min(gameConstants.ballMaxSpeed, speedOf(ball) * gameConstants.ballAccel);
  const horizontal = Math.sin(relative * maxAngle) * nextSpeed;
  const vertical = Math.cos(relative * maxAngle) * nextSpeed * signY;
  ball.speed = nextSpeed;
  ball.vx = horizontal;
  ball.vy = vertical;
  ball.y = signY > 0 ? rect.bottom + ball.radius : rect.top - ball.radius;
}

export function collidePaddles(game, nowMs) {
  const ball = game.ball;
  for (const paddle of game.paddles) {
    if (nowMs - (paddle.lastHitAt ?? -Infinity) < gameConstants.hitCooldownMs) continue;
    if (ball.lastHitPaddleId === paddle.id && nowMs - ball.lastHitAt < gameConstants.hitCooldownMs) continue;
    const rect = paddleRect(paddle);
    if (!overlapCircleAabb(ball, rect)) continue;

    if (paddle.axis === 'y') reflectVerticalPaddle(ball, paddle);
    else reflectHorizontalPaddle(ball, paddle);

    paddle.lastHitAt = nowMs;
    ball.lastHitPaddleId = paddle.id;
    ball.lastHitAt = nowMs;
    game.rallyHits += 1;
    return paddle;
  }
  return null;
}

export function advanceBall(game, dtSec) {
  const ball = game.ball;
  ball.x += ball.vx * dtSec;
  ball.y += ball.vy * dtSec;
}

export function wallBounce(game) {
  const ball = game.ball;
  const { width, height } = config.arena;
  if (ball.y - ball.radius <= 0 && ball.vy < 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
  } else if (ball.y + ball.radius >= height && ball.vy > 0) {
    ball.y = height - ball.radius;
    ball.vy = -Math.abs(ball.vy);
  }

  if (ball.x - ball.radius <= 0 && ball.vx < 0) return 'left';
  if (ball.x + ball.radius >= width && ball.vx > 0) return 'right';
  return null;
}

export function scoreForBoundary(boundary) {
  if (boundary === 'left') return 'right';
  if (boundary === 'right') return 'left';
  return null;
}

export function normalizeBallVelocity(ball) {
  const speed = clamp(speedOf(ball), gameConstants.ballBaseSpeed, gameConstants.ballMaxSpeed);
  const angle = Math.atan2(ball.vy, ball.vx);
  ball.speed = speed;
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
}

export function teamConceded(boundary) {
  return boundary === 'left' ? 'left' : boundary === 'right' ? 'right' : null;
}

export function randomServeTeam() {
  return Math.random() < 0.5 ? 'left' : 'right';
}

export function clampAngle(angle) {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

export { teamForSlot };
