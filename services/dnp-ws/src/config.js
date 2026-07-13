const integer = (env, key, fallback, min, max) => {
  if (env[key] === undefined || env[key] === '') return fallback;
  const value = Number(env[key]);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
  return value;
};

export function serviceConfig(env = process.env) {
  return {
    port: integer(env, 'PORT', 3000, 1, 65535),
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://node.xdoes.space').split(',').map(value => value.trim()).filter(Boolean),
    limits: {
      maxSockets: integer(env, 'DNP_WS_MAX_SOCKETS', 1000, 1, 1_000_000),
      maxRoomSockets: integer(env, 'DNP_WS_MAX_ROOM_SOCKETS', 100, 1, 100_000),
      maxPlayerSockets: integer(env, 'DNP_WS_MAX_PLAYER_SOCKETS', 3, 1, 1000),
      maxPendingAuth: integer(env, 'DNP_WS_MAX_PENDING_AUTH', 100, 1, 100_000),
      maxPayload: integer(env, 'DNP_WS_MAX_PAYLOAD_BYTES', 8192, 1, 16 * 1024 * 1024),
      authTimeoutMs: integer(env, 'DNP_WS_AUTH_TIMEOUT_MS', 5000, 1, 300_000),
      idleMs: integer(env, 'DNP_WS_IDLE_MS', 30000, 1, 86_400_000),
      readyTimeoutMs: integer(env, 'DNP_WS_READY_TIMEOUT_MS', 1000, 1, 30_000),
      readyCacheMs: integer(env, 'DNP_WS_READY_CACHE_MS', 1000, 0, 30_000),
      shutdownTimeoutMs: integer(env, 'DNP_WS_SHUTDOWN_TIMEOUT_MS', 10000, 1, 120_000),
    },
    hubOptions: {
      inputRate: integer(env, 'DNP_WS_INPUT_RATE', 45, 1, 1000),
      adminRate: integer(env, 'DNP_WS_ADMIN_RATE', 5, 1, 1000),
      maxBufferedAmount: integer(env, 'DNP_WS_MAX_BUFFERED_BYTES', 1024 * 1024, 1, 1_073_741_824),
      maxBackpressureStrikes: integer(env, 'DNP_WS_BACKPRESSURE_STRIKES', 3, 1, 1000),
      presenceMs: integer(env, 'DNP_WS_PRESENCE_MS', 10000, 1, 300_000),
      refreshMs: integer(env, 'DNP_WS_REFRESH_MS', 1000, 1, 300_000),
      simulationHz: 60,
      snapshotHz: 30,
    },
  };
}
