import test from 'node:test';
import assert from 'node:assert/strict';

test('socket ticket endpoint returns controlled fallback when realtime env is absent', async () => {
  const previousSecret = process.env.DNP_WS_TICKET_SECRET;
  const previousUrl = process.env.DNP_WS_PUBLIC_URL;
  delete process.env.DNP_WS_TICKET_SECRET;
  delete process.env.DNP_WS_PUBLIC_URL;
  try {
    const socketTicket = await import('./rooms/[code]/socket-ticket/route');
    const response = await socketTicket.POST(new Request('http://localhost/api/dnp/rooms/ABC234/socket-ticket', { method: 'POST' }), { params: Promise.resolve({ code: 'ABC234' }) });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /fallback/i);
  } finally {
    if (previousSecret === undefined) delete process.env.DNP_WS_TICKET_SECRET; else process.env.DNP_WS_TICKET_SECRET = previousSecret;
    if (previousUrl === undefined) delete process.env.DNP_WS_PUBLIC_URL; else process.env.DNP_WS_PUBLIC_URL = previousUrl;
  }
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
