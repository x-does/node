export type Paddle = {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
};

export type Ball = {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  speed: number;
};

export type DnpGameState = {
  width: number;
  height: number;
  player: Paddle;
  ai: Paddle;
  ball: Ball;
  playerScore: number;
  aiScore: number;
  paused: boolean;
  message: string;
  rally: number;
};

export type DnpInputState = {
  up: boolean;
  down: boolean;
  pointerY: number | null;
};

const ASPECT_RATIO = 5 / 3;
const PADDING = 32;
const MAX_WIDTH = 1100;
const MIN_WIDTH = 300;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function getResponsiveArenaSize(viewportWidth: number, viewportHeight: number) {
  const safeWidth = Math.max(MIN_WIDTH, viewportWidth - PADDING);
  const safeHeight = Math.max(180, viewportHeight - 220);
  let width = Math.min(MAX_WIDTH, safeWidth);
  let height = width / ASPECT_RATIO;

  if (height > safeHeight) {
    height = safeHeight;
    width = height * ASPECT_RATIO;
  }

  return { width: Math.round(width), height: Math.round(height) };
}

export function createInitialDnpState(width = 900, height = 540): DnpGameState {
  const paddleHeight = Math.max(76, Math.round(height * 0.2));
  const paddleWidth = Math.max(12, Math.round(width * 0.018));
  const ballSpeed = Math.max(330, Math.round(width * 0.46));

  return {
    width,
    height,
    player: {
      x: Math.round(width * 0.04),
      y: Math.round((height - paddleHeight) / 2),
      width: paddleWidth,
      height: paddleHeight,
      speed: Math.max(420, Math.round(height * 1.25)),
    },
    ai: {
      x: Math.round(width - width * 0.04 - paddleWidth),
      y: Math.round((height - paddleHeight) / 2),
      width: paddleWidth,
      height: paddleHeight,
      speed: Math.max(330, Math.round(height * 0.96)),
    },
    ball: resetBall(width, height, -1),
    playerScore: 0,
    aiScore: 0,
    paused: true,
    message: 'Press start to serve.',
    rally: 0,
  };
}

export function resetBall(width: number, height: number, direction: 1 | -1): Ball {
  const speed = Math.max(330, Math.round(width * 0.46));
  return {
    x: width / 2,
    y: height / 2,
    radius: Math.max(7, Math.round(width * 0.01)),
    vx: speed * direction,
    vy: speed * 0.18,
    speed,
  };
}

export function resizeDnpState(state: DnpGameState, width: number, height: number): DnpGameState {
  const next = createInitialDnpState(width, height);
  return {
    ...next,
    playerScore: state.playerScore,
    aiScore: state.aiScore,
    paused: state.paused,
    message: state.message,
    rally: state.rally,
  };
}

export function movePlayerPaddle(state: DnpGameState, input: DnpInputState, dt: number): DnpGameState {
  let y = state.player.y;

  if (input.pointerY !== null) {
    y = input.pointerY - state.player.height / 2;
  } else {
    const direction = Number(input.down) - Number(input.up);
    y += direction * state.player.speed * dt;
  }

  return {
    ...state,
    player: {
      ...state.player,
      y: clamp(y, 0, state.height - state.player.height),
    },
  };
}

export function getAiPaddleTarget(state: DnpGameState) {
  return clamp(state.ball.y + state.ball.vy * 0.2, state.ai.height / 2, state.height - state.ai.height / 2);
}

function moveAiPaddle(state: DnpGameState, dt: number): DnpGameState {
  const target = getAiPaddleTarget(state) - state.ai.height / 2;
  const delta = clamp(target - state.ai.y, -state.ai.speed * dt, state.ai.speed * dt);

  return {
    ...state,
    ai: {
      ...state.ai,
      y: clamp(state.ai.y + delta, 0, state.height - state.ai.height),
    },
  };
}

function overlaps(ball: Ball, paddle: Paddle) {
  return (
    ball.x + ball.radius >= paddle.x &&
    ball.x - ball.radius <= paddle.x + paddle.width &&
    ball.y + ball.radius >= paddle.y &&
    ball.y - ball.radius <= paddle.y + paddle.height
  );
}

function bounceFromPaddle(ball: Ball, paddle: Paddle, direction: 1 | -1, rally: number): Ball {
  const relative = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
  const speed = Math.min(ball.speed * 1.045 + 8, 860);
  const angle = clamp(relative, -0.95, 0.95) * 0.86;

  return {
    ...ball,
    speed,
    vx: Math.cos(angle) * speed * direction,
    vy: Math.sin(angle) * speed + Math.sin(rally) * 18,
    x: direction > 0 ? paddle.x + paddle.width + ball.radius + 1 : paddle.x - ball.radius - 1,
  };
}

export function stepDnpGame(state: DnpGameState, input: DnpInputState, dt: number): DnpGameState {
  if (state.paused) {
    return movePlayerPaddle(state, input, dt);
  }

  let next = moveAiPaddle(movePlayerPaddle(state, input, dt), dt);
  let ball: Ball = {
    ...next.ball,
    x: next.ball.x + next.ball.vx * dt,
    y: next.ball.y + next.ball.vy * dt,
  };
  let rally = next.rally;
  let message = next.message;

  if (ball.y - ball.radius <= 0) {
    ball = { ...ball, y: ball.radius, vy: Math.abs(ball.vy) };
  } else if (ball.y + ball.radius >= next.height) {
    ball = { ...ball, y: next.height - ball.radius, vy: -Math.abs(ball.vy) };
  }

  if (ball.vx < 0 && overlaps(ball, next.player)) {
    rally += 1;
    ball = bounceFromPaddle(ball, next.player, 1, rally);
    message = 'Nice return.';
  } else if (ball.vx > 0 && overlaps(ball, next.ai)) {
    rally += 1;
    ball = bounceFromPaddle(ball, next.ai, -1, rally);
    message = rally > 5 ? 'Rally heating up.' : 'AI returned.';
  }

  if (ball.x + ball.radius < 0) {
    return {
      ...next,
      ball: resetBall(next.width, next.height, 1),
      aiScore: next.aiScore + 1,
      paused: true,
      message: 'AI scores. Press resume.',
      rally: 0,
    };
  }

  if (ball.x - ball.radius > next.width) {
    return {
      ...next,
      ball: resetBall(next.width, next.height, -1),
      playerScore: next.playerScore + 1,
      paused: true,
      message: 'You score! Press resume.',
      rally: 0,
    };
  }

  return { ...next, ball, rally, message };
}

export function setPaused(state: DnpGameState, paused: boolean): DnpGameState {
  return { ...state, paused, message: paused ? 'Paused.' : 'Game on.' };
}

export function restartDnpGame(width: number, height: number): DnpGameState {
  return { ...createInitialDnpState(width, height), paused: false, message: 'Fresh serve.' };
}
