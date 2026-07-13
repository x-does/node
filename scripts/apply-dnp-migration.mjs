import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = path.join(ROOT, 'prisma/migrations/20260713000000_add_dnp_tables/migration.sql');
const PRISMA_CLI = path.join(ROOT, 'node_modules/prisma/build/index.js');

export function databaseUrlFromEnvironment(env = process.env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) return null;

  const url = new URL('mysql://localhost');
  url.hostname = env.DB_HOST;
  url.port = env.DB_PORT || '3306';
  url.username = env.DB_USER;
  url.password = env.DB_PASSWORD;
  url.pathname = `/${env.DB_NAME}`;
  return url.toString();
}

export function migrationDecision(env = process.env) {
  const databaseUrl = databaseUrlFromEnvironment(env);
  if (databaseUrl) return { action: 'run', databaseUrl };
  if (env.NODE_ENV === 'production') {
    return {
      action: 'fail',
      message: 'Production DNP migration requires DATABASE_URL or DB_HOST, DB_NAME, DB_USER and DB_PASSWORD.',
    };
  }
  return { action: 'skip', message: 'No database environment found; skipping DNP migration outside production.' };
}

export function applyDnpMigration(env = process.env) {
  const decision = migrationDecision(env);
  if (decision.action === 'skip') {
    console.log(`[dnp:migrate] ${decision.message}`);
    return 0;
  }
  if (decision.action === 'fail') {
    console.error(`[dnp:migrate] ${decision.message}`);
    return 1;
  }
  if (!existsSync(MIGRATION) || !existsSync(PRISMA_CLI)) {
    console.error('[dnp:migrate] Migration SQL or local Prisma CLI is missing.');
    return 1;
  }

  console.log('[dnp:migrate] Applying idempotent multiplayer schema using the deployment database environment.');
  const result = spawnSync(
    process.execPath,
    [PRISMA_CLI, 'db', 'execute', '--schema', path.join(ROOT, 'prisma/schema.prisma'), '--file', MIGRATION],
    {
      cwd: ROOT,
      env: { ...env, DATABASE_URL: decision.databaseUrl },
      stdio: 'inherit',
    },
  );
  if (result.error) {
    console.error(`[dnp:migrate] Could not start Prisma: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.error('[dnp:migrate] Prisma migration failed; stopping the build so multiplayer is not deployed half-configured.');
    return result.status ?? 1;
  }
  console.log('[dnp:migrate] Multiplayer schema is ready.');
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = applyDnpMigration();
