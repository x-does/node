function normalizeBasePath(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

function allowedOriginsFromEnv() {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) return configuredOrigins;
  if (process.env.NODE_ENV === 'production') return ['https://node.xdoes.space'];
  return [];
}

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 8080),
  basePath: normalizeBasePath(process.env.BASE_PATH || ''),
  allowedOrigins: allowedOriginsFromEnv(),
  tickRate: 60,
  arena: { width: 900, height: 540 },
  roomCleanupMs: 30_000,
  emptyRoomTtlMs: 5 * 60_000,
  matchmakingEmptyTtlMs: 30_000,
  maxPlayersPerRoom: 12,
  inputRateLimitMs: 12,
};

export const gameConstants = {
  paddleThickness: 14,
  sidePaddleLength: 96,
  edgePaddleLength: 120,
  splitGap: 8,
  paddleInset: 28,
  paddleSpeed: 360,
  ballRadius: 7,
  ballBaseSpeed: 260,
  ballMaxSpeed: 620,
  ballAccel: 1.045,
  scorePauseMs: 1000,
  hitCooldownMs: 90,
  aiSpeed: 300,
  winningScore: 10,
};
