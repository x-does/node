import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { WebSocket } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function listen(instance) {
  await new Promise((resolve) => instance.server.listen(0, '127.0.0.1', resolve));
  return instance.server.address().port;
}

function wsConnect(url, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: origin ? { Origin: origin } : {} });
    socket.once('open', () => {
      socket.close();
      resolve(true);
    });
    socket.once('error', reject);
    socket.once('unexpected-response', (_req, res) => {
      reject(new Error(`unexpected response ${res.statusCode}`));
    });
  });
}

test('interactive catalogue exposes DefinitelyNotPong at /dnp', async () => {
  const catalogue = await text('src/app/interactive-apps/catalogue.ts');
  assert.match(catalogue, /title:\s*['"]DefinitelyNotPong['"]/);
  assert.match(catalogue, /href:\s*['"]\/dnp['"]/);
  assert.match(catalogue, /status:\s*['"]live['"]/);
});

test('Hostinger runtime preparation uses a committed startup wrapper', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  assert.match(packageJson.scripts.build, /prepare-hostinger-runtime\.mjs/);
  await access(path.join(root, 'scripts/templates/hostinger-server.cjs'));
  const prepare = await text('scripts/prepare-hostinger-runtime.mjs');
  assert.match(prepare, /scripts[\/]templates[\/]hostinger-server\.cjs|hostinger-server\.cjs/);
  assert.match(prepare, /vendor[\/]dnp|vendor', 'dnp/);
  assert.match(prepare, /\.next['"], ['"]static|sourceNextStatic/);
  assert.match(prepare, /runtimeNextStatic/);
  assert.match(prepare, /sourcePublic/);
  assert.match(prepare, /runtimePublic/);
});

test('Passenger startup wrapper mounts DNP on the shared HTTP server before Next', async () => {
  const wrapper = await text('scripts/templates/hostinger-server.cjs');
  assert.match(wrapper, /createServer\(app\)/);
  assert.match(wrapper, /createDefinitelyNotPongServer/);
  assert.match(wrapper, /DNP_BASE_PATH\s*\|\|\s*['"]\/dnp['"]/);
  assert.match(wrapper, /process\.env\.HOST\s*\|\|\s*['"]0\.0\.0\.0['"]/);
  assert.match(wrapper, /process\.env\.PORT/);
  assert.ok(wrapper.indexOf('createDefinitelyNotPongServer') < wrapper.indexOf('handle(req, res)'), 'DNP must be mounted before the Next fallback handler');
});

test('vendored DNP runtime includes server and browser client', async () => {
  await access(path.join(root, 'vendor/dnp/server/index.mjs'));
  await access(path.join(root, 'vendor/dnp/client/index.html'));
  const server = await text('vendor/dnp/server/index.mjs');
  assert.match(server, /export function createDefinitelyNotPongServer/);
  assert.match(server, /\/healthz/);
  assert.match(server, /WebSocketServer/);
});

test('production WebSocket origins fail closed to canonical node.xdoes.space when not explicitly configured', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOWED_ORIGINS;

  const { createDefinitelyNotPongServer } = await import(`${pathToFileURL(path.join(root, 'vendor/dnp/server/index.mjs')).href}?prod-origin-${Date.now()}`);
  const instance = createDefinitelyNotPongServer({ app: express(), basePath: '/dnp' });

  try {
    const port = await listen(instance);
    await assert.rejects(wsConnect(`ws://127.0.0.1:${port}/dnp/ws`, 'https://evil.example'), /403|unexpected response/);
    await wsConnect(`ws://127.0.0.1:${port}/dnp/ws`, 'https://node.xdoes.space');
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
    await new Promise((resolve) => instance.shutdown(resolve));
  }
});

test('local development WebSocket origins remain permissive when not explicitly configured', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = 'development';
  delete process.env.ALLOWED_ORIGINS;

  const { createDefinitelyNotPongServer } = await import(`${pathToFileURL(path.join(root, 'vendor/dnp/server/index.mjs')).href}?dev-origin-${Date.now()}`);
  const instance = createDefinitelyNotPongServer({ app: express(), basePath: '/dnp' });

  try {
    const port = await listen(instance);
    await wsConnect(`ws://127.0.0.1:${port}/dnp/ws`, 'http://localhost:3000');
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
    await new Promise((resolve) => instance.shutdown(resolve));
  }
});

test('join-code fallback does not interpolate unescaped reflected HTML', async () => {
  const server = await text('vendor/dnp/server/index.mjs');
  assert.match(server, /escapeHtml/);
  assert.doesNotMatch(server, /\$\{String\(req\.params\.code\)\.toUpperCase\(\)\}/);
});

test('Passenger startup wrapper degrades to Next-only if DNP import or mount fails', async () => {
  const wrapper = await text('scripts/templates/hostinger-server.cjs');
  assert.match(wrapper, /mountDefinitelyNotPong/);
  assert.match(wrapper, /catch \(error\)/);
  assert.match(wrapper, /DNP unavailable; continuing with Next-only runtime/);
});

test('Hostinger runtime preparation copies installed optional dependencies and package script exposes DNP integration tests', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  assert.equal(packageJson.scripts.test, 'node --test tests/dnp-integration.test.mjs');
  const prepare = await text('scripts/prepare-hostinger-runtime.mjs');
  assert.match(prepare, /optionalDependencies/);
  assert.match(prepare, /copyInstalledOptional/);
});

test('Passenger startup wrapper gracefully shuts down on SIGINT and SIGTERM', async () => {
  const wrapper = await text('scripts/templates/hostinger-server.cjs');
  assert.match(wrapper, /SIGINT/);
  assert.match(wrapper, /SIGTERM/);
  assert.match(wrapper, /server\.close/);
});
