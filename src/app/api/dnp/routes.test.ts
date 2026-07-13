import test from 'node:test';
import assert from 'node:assert/strict';

test('dnp route handlers export ordinary Next handlers without custom runtime', async () => {
  const rooms = await import('./rooms/route');
  const matchmaking = await import('./matchmaking/route');
  const join = await import('./rooms/[code]/join/route');
  const poll = await import('./rooms/[code]/route');
  const input = await import('./rooms/[code]/input/route');
  const admin = await import('./rooms/[code]/admin/route');
  const leave = await import('./rooms/[code]/leave/route');

  assert.equal(typeof rooms.POST, 'function');
  assert.equal(typeof matchmaking.POST, 'function');
  assert.equal(typeof join.POST, 'function');
  assert.equal(typeof poll.GET, 'function');
  assert.equal(typeof poll.POST, 'function');
  assert.equal(typeof input.POST, 'function');
  assert.equal(typeof admin.POST, 'function');
  assert.equal(typeof leave.POST, 'function');
  for (const mod of [rooms, matchmaking, join, poll, input, admin, leave]) {
    assert.equal('runtime' in mod, false);
  }
});
