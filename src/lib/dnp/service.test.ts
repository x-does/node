import test from 'node:test';
import assert from 'node:assert/strict';

import { hashDnpToken } from './domain';
import { InMemoryDnpAdapter } from './memory-adapter';
import { DnpRoomService, DnpServiceError } from './service';

async function createWithPlayers(count: number) {
  const adapter = new InMemoryDnpAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  const joined = [created];
  for (let index = 2; index <= count; index += 1) joined.push(await service.joinRoom(created.room.code, `P${index}`));
  return { adapter, service, created, joined };
}

test('creates rooms with hashed stored credentials and raw token only in response', async () => {
  const { adapter, created } = await createWithPlayers(1);
  const stored = [...adapter.players.values()][0];
  assert.equal(stored.tokenHash, hashDnpToken(created.token));
  assert.notEqual(stored.tokenHash, created.token);
  assert.equal(JSON.stringify(created.room).includes(created.token), false);
});

test('enforces max 12 players and deterministic slots', async () => {
  const { service, created, joined } = await createWithPlayers(12);
  assert.deepEqual(joined.at(-1)?.room.players.map((player) => player.slotIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  await assert.rejects(() => service.joinRoom(created.room.code, 'TooMany'), (error) => error instanceof DnpServiceError && error.status === 409);
});

test('start requires admin token and two players', async () => {
  const { service, created } = await createWithPlayers(1);
  await assert.rejects(() => service.adminAction(created.room.code, 'bad-token', 'start'), (error) => error instanceof DnpServiceError && error.status === 403);
  await assert.rejects(() => service.adminAction(created.room.code, created.token, 'start'), (error) => error instanceof DnpServiceError && error.status === 409);
  await service.joinRoom(created.room.code, 'Second');
  const started = await service.adminAction(created.room.code, created.token, 'start');
  assert.equal(started.room.status, 'playing');
});

test('kick removes non-admin players and admin leaving transfers to lowest join order active player', async () => {
  const { service, created, joined } = await createWithPlayers(3);
  const second = joined[1];
  const thirdId = joined[2].playerId;
  const kicked = await service.adminAction(created.room.code, created.token, 'kick', { playerId: thirdId });
  assert.equal(kicked.room.players.some((player) => player.id === thirdId), false);
  const left = await service.leaveRoom(created.room.code, created.token);
  assert.equal(left.room.adminPlayerId, second.playerId);
});

test('admin can transfer authority and reassign only when every active player is uniquely assigned', async () => {
  const { service, created, joined } = await createWithPlayers(3);
  const second = joined[1];
  const third = joined[2];
  const transferred = await service.adminAction(created.room.code, created.token, 'transfer', { playerId: second.playerId });
  assert.equal(transferred.room.adminPlayerId, second.playerId);
  await assert.rejects(() => service.adminAction(created.room.code, second.token, 'reassign', { assignments: { [created.playerId]: 5, [second.playerId]: 0 } }), (error) => error instanceof DnpServiceError && error.status === 400);
  const reassigned = await service.adminAction(created.room.code, second.token, 'reassign', { assignments: { [created.playerId]: 5, [second.playerId]: 0, [third.playerId]: 1 } });
  assert.equal(reassigned.room.players.find((player) => player.id === created.playerId)?.slotIndex, 5);
});

test('input sequence numbers are monotonic and return updated room snapshots', async () => {
  const { adapter, service, created } = await createWithPlayers(1);
  const first = await service.submitInput(created.room.code, created.token, 0.8, 4);
  await service.submitInput(created.room.code, created.token, 0.1, 3);
  const stored = [...adapter.players.values()][0];
  assert.equal(stored.inputPosition, 0.8);
  assert.equal(stored.inputSeq, 4);
  assert.equal(first.room.players[0].input, 0.8);
});

test('random matchmaking pairs second player into waiting 1v1 room', async () => {
  const adapter = new InMemoryDnpAdapter();
  const service = new DnpRoomService(adapter);
  const first = await service.joinMatchmaking('One');
  assert.equal(first.room.mode, 'matchmaking');
  assert.equal(first.room.status, 'lobby');
  const second = await service.joinMatchmaking('Two');
  assert.equal(second.room.code, first.room.code);
  assert.equal(second.room.status, 'playing');
  assert.equal(second.room.players.length, 2);
});

test('poll requires a valid active player token and advances multiplayer snapshots', async () => {
  const { adapter, service, created } = await createWithPlayers(2);
  await assert.rejects(() => service.pollRoom(created.room.code), (error) => error instanceof DnpServiceError && error.status === 403);
  await assert.rejects(() => service.pollRoom(created.room.code, 'bad-token'), (error) => error instanceof DnpServiceError && error.status === 403);
  await service.adminAction(created.room.code, created.token, 'start');
  const stored = [...adapter.rooms.values()][0];
  const staleTick = new Date(Date.now() - 1000);
  adapter.rooms.set(stored.id, { ...stored, lastTickAt: staleTick });
  const polled = await service.pollRoom(created.room.code, created.token);
  const updated = [...adapter.rooms.values()][0];
  assert.notEqual(polled.room.ball.x, stored.ballX);
  assert.equal(updated.ballX, polled.room.ball.x);
  assert.ok(updated.lastTickAt.getTime() > staleTick.getTime());
});

test('left player slots can be reused by new joins', async () => {
  const { service, created, joined } = await createWithPlayers(2);
  await service.leaveRoom(created.room.code, joined[1].token);
  const replacement = await service.joinRoom(created.room.code, 'Replacement');
  assert.equal(replacement.room.players.find((player) => player.id === replacement.playerId)?.slotIndex, 1);
});

test('private rooms reject new joins once playing but allow token reconnect', async () => {
  const { service, created, joined } = await createWithPlayers(2);
  await service.adminAction(created.room.code, created.token, 'start');
  await assert.rejects(() => service.joinRoom(created.room.code, 'Late'), (error) => error instanceof DnpServiceError && error.status === 409);
  const reconnect = await service.joinRoom(created.room.code, 'SecondAgain', joined[1].token);
  assert.equal(reconnect.playerId, joined[1].playerId);
});

test('stale admin is transferred before admin and input actions', async () => {
  const { adapter, service, created, joined } = await createWithPlayers(3);
  const admin = [...adapter.players.values()].find((player) => player.id === created.playerId)!;
  adapter.players.set(admin.id, { ...admin, lastSeenAt: new Date(Date.now() - 130_000) });
  await assert.rejects(() => service.adminAction(created.room.code, created.token, 'start'), (error) => error instanceof DnpServiceError && error.status === 403);
  const started = await service.adminAction(created.room.code, joined[1].token, 'start');
  assert.equal(started.room.adminPlayerId, joined[1].playerId);
  const input = await service.submitInput(created.room.code, joined[1].token, 0.7, 1);
  assert.equal(input.room.adminPlayerId, joined[1].playerId);
});

test('optimistic room version conflicts are surfaced for retryable concurrency handling', async () => {
  const adapter = new InMemoryDnpAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  const room = [...adapter.rooms.values()][0];
  await assert.rejects(() => adapter.updateRoom(room.id, { version: room.version + 1 }, room.version + 99), (error) => error instanceof DnpServiceError && error.status === 409);
  assert.equal(created.room.players.length, 1);
});
