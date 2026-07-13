import { getDnpSlot, getDnpSlotGeometry, type DnpPublicPlayer, type DnpPublicRoom } from './domain';

export const DNP_ARENA_WIDTH = 1000;
export const DNP_ARENA_HEIGHT = 600;
const BALL_RADIUS = 10;
const BALL_SPEED = 420;
const MAX_STEPS = 20;
const FIXED_DT = 1 / 30;

export function createDnpBall(direction: 1 | -1 = 1) {
  return { x: 0.5, y: 0.5, vx: direction * 0.42, vy: 0.17 };
}

function denormalizeBall(ball: DnpPublicRoom['ball']) {
  return {
    x: ball.x * DNP_ARENA_WIDTH,
    y: ball.y * DNP_ARENA_HEIGHT,
    vx: ball.vx * DNP_ARENA_WIDTH,
    vy: ball.vy * DNP_ARENA_HEIGHT,
  };
}

function normalizeBall(ball: ReturnType<typeof denormalizeBall>) {
  return {
    x: ball.x / DNP_ARENA_WIDTH,
    y: ball.y / DNP_ARENA_HEIGHT,
    vx: ball.vx / DNP_ARENA_WIDTH,
    vy: ball.vy / DNP_ARENA_HEIGHT,
  };
}

function paddleForPlayer(player: DnpPublicPlayer) {
  const geometry = getDnpSlotGeometry(player.slotIndex, DNP_ARENA_WIDTH, DNP_ARENA_HEIGHT);
  const slot = getDnpSlot(player.slotIndex);
  if (geometry.axis === 'y') {
    const range = DNP_ARENA_HEIGHT - geometry.height;
    return { ...geometry, y: Math.round(Math.max(0, Math.min(1, player.input)) * range) };
  }
  const halfMin = slot.half === 'left' ? 22 : DNP_ARENA_WIDTH / 2 + 22;
  const halfMax = slot.half === 'left' ? DNP_ARENA_WIDTH / 2 - 22 : DNP_ARENA_WIDTH - 22;
  const range = halfMax - halfMin - geometry.width;
  return { ...geometry, x: Math.round(halfMin + Math.max(0, Math.min(1, player.input)) * range) };
}

function overlaps(ball: ReturnType<typeof denormalizeBall>, paddle: ReturnType<typeof paddleForPlayer>) {
  return (
    ball.x + BALL_RADIUS >= paddle.x &&
    ball.x - BALL_RADIUS <= paddle.x + paddle.width &&
    ball.y + BALL_RADIUS >= paddle.y &&
    ball.y - BALL_RADIUS <= paddle.y + paddle.height
  );
}

function bounce(ball: ReturnType<typeof denormalizeBall>, player: DnpPublicPlayer, paddle: ReturnType<typeof paddleForPlayer>) {
  const slot = getDnpSlot(player.slotIndex);
  const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.025 + 8, 760);
  if (slot.kind === 'side') {
    const relative = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
    const direction = slot.half === 'left' ? 1 : -1;
    ball.vx = direction * Math.max(220, Math.cos(relative * 0.9) * speed);
    ball.vy = Math.sin(relative * 0.9) * speed;
    ball.x = direction > 0 ? paddle.x + paddle.width + BALL_RADIUS + 1 : paddle.x - BALL_RADIUS - 1;
  } else {
    const relative = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    const direction = slot.kind === 'top' ? 1 : -1;
    ball.vy = direction * Math.max(180, Math.cos(relative * 0.9) * speed);
    ball.vx = Math.sin(relative * 0.9) * speed + (slot.half === 'left' ? 55 : -55);
    ball.y = direction > 0 ? paddle.y + paddle.height + BALL_RADIUS + 1 : paddle.y - BALL_RADIUS - 1;
  }
}

export function advanceDnpSimulation(room: DnpPublicRoom, elapsedMs: number): DnpPublicRoom {
  if (room.status !== 'playing' || elapsedMs <= 0) return room;
  const next: DnpPublicRoom = { ...room, scores: { ...room.scores }, ball: { ...room.ball } };
  const ball = denormalizeBall(next.ball);
  const steps = Math.min(MAX_STEPS, Math.ceil(elapsedMs / 1000 / FIXED_DT));
  const dt = Math.min(FIXED_DT, elapsedMs / 1000 / Math.max(1, steps));

  for (let step = 0; step < steps; step += 1) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y - BALL_RADIUS <= 0) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy || BALL_SPEED * 0.2);
    } else if (ball.y + BALL_RADIUS >= DNP_ARENA_HEIGHT) {
      ball.y = DNP_ARENA_HEIGHT - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy || BALL_SPEED * 0.2);
    }

    for (const player of next.players) {
      const paddle = paddleForPlayer(player);
      if (overlaps(ball, paddle)) bounce(ball, player, paddle);
    }

    if (ball.x + BALL_RADIUS < 0) {
      next.scores.right += 1;
      Object.assign(ball, { x: DNP_ARENA_WIDTH / 2, y: DNP_ARENA_HEIGHT / 2, vx: BALL_SPEED, vy: BALL_SPEED * 0.17 });
    } else if (ball.x - BALL_RADIUS > DNP_ARENA_WIDTH) {
      next.scores.left += 1;
      Object.assign(ball, { x: DNP_ARENA_WIDTH / 2, y: DNP_ARENA_HEIGHT / 2, vx: -BALL_SPEED, vy: BALL_SPEED * 0.17 });
    }
  }

  next.ball = normalizeBall(ball);
  return next;
}
