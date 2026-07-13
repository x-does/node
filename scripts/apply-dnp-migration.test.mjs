import assert from 'node:assert/strict';
import test from 'node:test';

import { databaseUrlFromEnvironment, migrationDecision } from './apply-dnp-migration.mjs';

test('builds an encoded MySQL URL from Hostinger DB_* variables', () => {
  const url = databaseUrlFromEnvironment({
    DB_HOST: 'db.example.test',
    DB_PORT: '3307',
    DB_NAME: 'game db',
    DB_USER: 'dnp@user',
    DB_PASSWORD: 'p:a/ss',
  });
  const parsed = new URL(url);
  assert.equal(parsed.hostname, 'db.example.test');
  assert.equal(parsed.port, '3307');
  assert.equal(decodeURIComponent(parsed.username), 'dnp@user');
  assert.equal(decodeURIComponent(parsed.password), 'p:a/ss');
  assert.equal(decodeURIComponent(parsed.pathname), '/game db');
});

test('prefers an explicit DATABASE_URL', () => {
  assert.equal(databaseUrlFromEnvironment({ DATABASE_URL: 'mysql://explicit/db' }), 'mysql://explicit/db');
});

test('skips without database credentials during local builds', () => {
  assert.equal(migrationDecision({ NODE_ENV: 'development' }).action, 'skip');
});

test('fails closed when production build credentials are incomplete', () => {
  const decision = migrationDecision({ NODE_ENV: 'production', DB_HOST: 'db.example.test' });
  assert.equal(decision.action, 'fail');
});
