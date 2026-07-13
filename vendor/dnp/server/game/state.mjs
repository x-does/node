import { config, gameConstants } from '../config.mjs';
import { updateAi } from './ai.mjs';
import { advanceBall, collidePaddles, makeBall, movePaddles, normalizeBallVelocity, scoreForBoundary, teamConceded, wallBounce } from './physics.mjs';
import { defaultPositionFor, makePaddle, slotBounds, slotCountsForRoom, SLOT_NAMES } from './layout.mjs';

function nowMs() {
  return Date.now();
}

function slotPlayers(room) {
  return [...(room?.players?.values?.() || [])]
    .filter((player) => SLOT_NAMES.includes(player.slot))
    .sort((a, b) => SLOT_NAMES.indexOf(a.slot) - SLOT_NAMES.indexOf(b.slot) || (a.subIndex || 0) - (b.subIndex || 0) || String(a.id).localeCompare(String(b.id)));
}

function buildPaddles(room, previous = []) {
  const previousById = new Map(previous.map((paddle) => [paddle.playerId || paddle.id, paddle]));
  const counts = slotCountsForRoom(room);
  return slotPlayers(room).map((player) => {
    const old = previousById.get(player.id);
    const bounds = slotBounds(player.slot, player, counts);
    const paddle = makePaddle(player, counts, old);
    paddle._boundsMin = bounds.min;
    paddle._boundsMax = bounds.max;
    if (!Number.isFinite(paddle.position)) paddle.position = defaultPositionFor(player.slot, player, counts);
    return paddle;
  });
}

function syncPaddleInputs(room, game) {
  for (const paddle of game.paddles) {
    const player = room.players.get(paddle.playerId || paddle.id);
    paddle.name = player?.name || paddle.name;
    paddle.inputDirection = Number(player?.inputDirection || 0);
  }
}

function resetAfterScore(game, concededTeam, timestamp) {
  game.status = 'paused';
  game.pauseUntil = timestamp + gameConstants.scorePauseMs;
  game.serveTeam = concededTeam;
  game.ball = makeBall(concededTeam);
  game.rallyHits = 0;
}

function maybeFinish(room, game) {
  if (game.scores.left >= gameConstants.winningScore || game.scores.right >= gameConstants.winningScore) {
    game.status = 'finished';
    game.winner = game.scores.left > game.scores.right ? 'left' : 'right';
    room.status = 'finished';
    return true;
  }
  return false;
}

export function createGame(room) {
  const timestamp = nowMs();
  const serveTeam = timestamp % 2 === 0 ? 'left' : 'right';
  const game = {
    arena: { ...config.arena },
    tickRate: config.tickRate,
    status: 'playing',
    createdAt: timestamp,
    updatedAt: timestamp,
    elapsedMs: 0,
    pauseUntil: 0,
    serveTeam,
    winner: null,
    scores: { left: 0, right: 0 },
    ball: makeBall(serveTeam),
    paddles: [],
    rallyHits: 0,
  };
  game.paddles = buildPaddles(room);
  room.game = game;
  return game;
}

export function restartGame(room) {
  if (room) room.status = 'playing';
  return createGame(room);
}

export function updateGame(room, dtMs) {
  if (!room) return null;
  const game = room.game || createGame(room);
  const timestamp = nowMs();
  const cappedDtMs = Math.max(0, Math.min(Number(dtMs) || 0, 100));
  const dtSec = cappedDtMs / 1000;

  game.updatedAt = timestamp;
  game.elapsedMs += cappedDtMs;
  game.paddles = buildPaddles(room, game.paddles);
  syncPaddleInputs(room, game);

  if (game.status === 'finished' || room.status === 'finished') return game;

  if (game.status === 'paused') {
    if (timestamp < game.pauseUntil) return game;
    game.status = 'playing';
  }

  updateAi(room, game, dtSec);
  movePaddles(game, dtSec);
  advanceBall(game, dtSec);
  collidePaddles(game, timestamp);
  normalizeBallVelocity(game.ball);

  const boundary = wallBounce(game);
  const scoringTeam = scoreForBoundary(boundary);
  if (scoringTeam) {
    game.scores[scoringTeam] += 1;
    if (!maybeFinish(room, game)) resetAfterScore(game, teamConceded(boundary), timestamp);
  }

  return game;
}

function serializePaddle(paddle) {
  return {
    id: paddle.id,
    playerId: paddle.playerId,
    name: paddle.name,
    isAi: paddle.isAi,
    slot: paddle.slot,
    subIndex: paddle.subIndex,
    team: paddle.team,
    axis: paddle.axis,
    x: Math.round(paddle.x * 100) / 100,
    y: Math.round(paddle.y * 100) / 100,
    width: paddle.width,
    height: paddle.height,
    w: paddle.w,
    h: paddle.h,
  };
}

function serializeBall(ball) {
  return {
    x: Math.round(ball.x * 100) / 100,
    y: Math.round(ball.y * 100) / 100,
    radius: ball.radius,
    r: ball.r,
    vx: Math.round(ball.vx * 100) / 100,
    vy: Math.round(ball.vy * 100) / 100,
    speed: Math.round(ball.speed * 100) / 100,
  };
}

export function serializeGameState(room) {
  const game = room?.game;
  if (!game) return null;
  return {
    arena: game.arena,
    tickRate: game.tickRate,
    status: game.status,
    phase: game.status,
    winner: game.winner,
    scores: { ...game.scores },
    score: { ...game.scores },
    leftScore: game.scores.left,
    rightScore: game.scores.right,
    ball: serializeBall(game.ball),
    paddles: game.paddles.map(serializePaddle),
    players: game.paddles.map(serializePaddle),
    rallyHits: game.rallyHits,
    pauseUntil: game.pauseUntil,
    serveTeam: game.serveTeam,
    constants: {
      paddleThickness: gameConstants.paddleThickness,
      sidePaddleLength: gameConstants.sidePaddleLength,
      edgePaddleLength: gameConstants.edgePaddleLength,
      ballRadius: gameConstants.ballRadius,
      winningScore: gameConstants.winningScore,
    },
  };
}
