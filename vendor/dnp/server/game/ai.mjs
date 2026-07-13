import { gameConstants } from '../config.mjs';
import { clamp } from './layout.mjs';

function deterministicNoise(game) {
  const seed = Math.sin((game.rallyHits + 1) * 12.9898 + game.scores.left * 78.233 + game.scores.right * 37.719) * 43758.5453;
  return seed - Math.floor(seed);
}

export function updateAi(room, game, dtSec) {
  if (!room?.isSinglePlayer || !game) return;
  const aiPlayer = [...room.players.values()].find((player) => player.isAi && player.slot === 'right_side');
  if (!aiPlayer) return;
  const paddle = game.paddles.find((p) => p.playerId === aiPlayer.id || p.id === aiPlayer.id);
  if (!paddle) return;

  if (game.status !== 'playing') {
    aiPlayer.inputDirection = 0;
    paddle.inputDirection = 0;
    return;
  }

  const ball = game.ball;
  const imperfection = (deterministicNoise(game) - 0.5) * 52;
  const targetY = ball.y + imperfection;
  const center = paddle.y + paddle.height / 2;
  const deadZone = 14 + Math.min(20, Math.abs(ball.vx) / 40);
  const rawDirection = targetY < center - deadZone ? -1 : targetY > center + deadZone ? 1 : 0;

  aiPlayer.inputDirection = rawDirection;
  paddle.inputDirection = rawDirection;
  paddle._maxMoveThisTick = gameConstants.aiSpeed * dtSec;
  paddle.position = clamp(paddle.position, paddle._boundsMin ?? 0, paddle._boundsMax ?? Number.POSITIVE_INFINITY);
}
