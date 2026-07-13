import test from 'node:test';
import assert from 'node:assert/strict';

import { databaseConfig } from '../src/database.js';
import { serviceConfig } from '../src/config.js';

test('database TLS is optional and always verifies certificates when enabled', () => {
  assert.equal(databaseConfig({ DB_HOST: 'db' }).ssl, undefined);
  const config = databaseConfig({ DB_HOST: 'db', DB_SSL: 'true', DB_SSL_CA: 'trusted-ca' });
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: 'trusted-ca' });
  const urlConfig = databaseConfig({ DATABASE_URL: 'mysql://user:pass@db.example:3307/game', DB_SSL: 'true' });
  assert.equal(urlConfig.host, 'db.example');
  assert.equal(urlConfig.port, 3307);
  assert.equal(urlConfig.ssl.rejectUnauthorized, true);
  assert.notEqual(urlConfig.ssl.rejectUnauthorized, false);
});

test('DATABASE_URL preserves supported connection options, decodes the database, and cannot disable verified TLS', () => {
  const config = databaseConfig({ DATABASE_URL: 'mysql://user:pass@db.example:3307/game%20room?ssl-mode=REQUIRED&charset=utf8mb4&connectTimeout=2500&connectionLimit=7' });
  assert.equal(config.database, 'game room');
  assert.equal(config.charset, 'utf8mb4');
  assert.equal(config.connectTimeout, 2500);
  assert.equal(config.connectionLimit, 7);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.throws(() => databaseConfig({ DATABASE_URL: 'mysql://u:p@db/game?ssl-mode=DISABLED' }), /TLS.*disable/i);
  assert.throws(() => databaseConfig({ DATABASE_URL: 'mysql://u:p@db/game?rejectUnauthorized=false' }), /TLS.*verification/i);
});

test('service limits are environment configurable while cadence remains 60Hz simulation and 30Hz snapshots', () => {
  const config = serviceConfig({
    DNP_WS_MAX_SOCKETS: '40', DNP_WS_MAX_ROOM_SOCKETS: '12', DNP_WS_MAX_PLAYER_SOCKETS: '2',
    DNP_WS_MAX_PENDING_AUTH: '9', DNP_WS_MAX_PAYLOAD_BYTES: '4096', DNP_WS_AUTH_TIMEOUT_MS: '2500',
    DNP_WS_IDLE_MS: '45000', DNP_WS_INPUT_RATE: '35', DNP_WS_ADMIN_RATE: '4',
  });
  assert.deepEqual(config.limits, { maxSockets: 40, maxRoomSockets: 12, maxPlayerSockets: 2, maxPendingAuth: 9, maxPayload: 4096, authTimeoutMs: 2500, idleMs: 45000, readyTimeoutMs: 1000, readyCacheMs: 1000, shutdownTimeoutMs: 10000 });
  assert.equal(config.hubOptions.inputRate, 35);
  assert.equal(config.hubOptions.adminRate, 4);
  assert.equal(config.hubOptions.simulationHz, 60);
  assert.equal(config.hubOptions.snapshotHz, 30);
});

test('integer environment values are strict and range checked including PORT', () => {
  assert.equal(serviceConfig({ PORT: '65535' }).port, 65535);
  for (const env of [
    { PORT: '0' }, { PORT: '65536' }, { PORT: '3000.5' }, { PORT: 'abc' },
    { DNP_WS_MAX_SOCKETS: '-1' }, { DNP_WS_MAX_PAYLOAD_BYTES: '1.5' },
  ]) assert.throws(() => serviceConfig(env), /integer|between/i);
});
