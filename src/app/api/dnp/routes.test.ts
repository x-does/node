import test from 'node:test';
import assert from 'node:assert/strict';

test('socket ticket explicitly reports non-retryable unavailable capability only after authentication', async () => {
  const routeSource = await import('node:fs/promises').then(fs => fs.readFile(new URL('./rooms/[code]/socket-ticket/route.ts', import.meta.url), 'utf8'));
  assert.match(routeSource, /authenticatePlayer[\s\S]*if \(!secret \|\| !publicUrl\)[\s\S]*reason: 'not_configured'/);
});

test('socket ticket authenticates and rate-limits before capability reporting and validates configured wss URL', async () => {
  const routeSource = await import('node:fs/promises').then(fs => fs.readFile(new URL('./rooms/[code]/socket-ticket/route.ts', import.meta.url), 'utf8'));
  assert.match(routeSource, /authenticatePlayer[\s\S]*DNP_WS_TICKET_SECRET/);
  assert.match(routeSource, /checkDnpRateLimit[\s\S]*DNP_WS_TICKET_SECRET/);
  assert.match(routeSource, /protocol\s*!==\s*'wss:'/);
  assert.match(routeSource, /pathname\s*!==\s*['"]\/["']/);
  assert.match(routeSource, /available:\s*true/);
});

test('dnp route handlers export ordinary Next handlers without custom runtime', async () => {
  const rooms = await import('./rooms/route');
  const matchmaking = await import('./matchmaking/route');
  const join = await import('./rooms/[code]/join/route');
  const poll = await import('./rooms/[code]/route');
  const input = await import('./rooms/[code]/input/route');
  const admin = await import('./rooms/[code]/admin/route');
  const leave = await import('./rooms/[code]/leave/route');
  const socketTicket = await import('./rooms/[code]/socket-ticket/route');

  assert.equal(typeof rooms.POST, 'function');
  assert.equal(typeof matchmaking.POST, 'function');
  assert.equal(typeof join.POST, 'function');
  assert.equal(typeof poll.GET, 'function');
  assert.equal(typeof poll.POST, 'function');
  assert.equal(typeof input.POST, 'function');
  assert.equal(typeof admin.POST, 'function');
  assert.equal(typeof leave.POST, 'function');
  assert.equal(typeof socketTicket.POST, 'function');
  for (const mod of [rooms, matchmaking, join, poll, input, admin, leave, socketTicket]) {
    assert.equal('runtime' in mod, false);
  }
});
