import test from 'node:test';
import assert from 'node:assert/strict';

import { hashDnpToken } from './domain';
import { InMemoryDnpAdapter } from './memory-adapter';
import { DnpRoomService, DnpServiceError } from './service';

class InstrumentedDnpAdapter extends InMemoryDnpAdapter {
  roomUpdates = 0;
  playerUpdates = 0;

  resetCounts() {
    this.roomUpdates = 0;
    this.playerUpdates = 0;
  }

  override async updateRoom(id: string, data: Parameters<InMemoryDnpAdapter['updateRoom']>[1], expectedVersion?: number) {
    this.roomUpdates += 1;
    return super.updateRoom(id, data, expectedVersion);
  }

  override async updatePlayer(id: string, data: Parameters<InMemoryDnpAdapter['updatePlayer']>[1]) {
    this.playerUpdates += 1;
    return super.updatePlayer(id, data);
  }

  override async updatePlayerInputIfNewer(id: string, position: number, seq: number, lastSeenAt: Date) {
    this.playerUpdates += 1;
    return super.updatePlayerInputIfNewer(id, position, seq, lastSeenAt);
  }

  override async expirePlayerIfLastSeenBefore(id: string, cutoff: Date, leftAt: Date) {
    this.playerUpdates += 1;
    return super.expirePlayerIfLastSeenBefore(id, cutoff, leftAt);
  }
}

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

test('concurrent stale input cannot overwrite a newer sequence under ReadCommitted reads', async () => {
  class ReorderedInputAdapter extends InMemoryDnpAdapter {
    override async updatePlayerInputIfNewer(id: string, position: number, seq: number, lastSeenAt: Date) {
      if (seq === 1) await new Promise((resolve) => setTimeout(resolve, 20));
      return super.updatePlayerInputIfNewer(id, position, seq, lastSeenAt);
    }
  }
  const adapter = new ReorderedInputAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');

  await Promise.all([
    service.submitInput(created.room.code, created.token, 0.2, 1),
    service.submitInput(created.room.code, created.token, 0.9, 2),
  ]);

  const stored = [...adapter.players.values()][0];
  assert.equal(stored.inputSeq, 2);
  assert.equal(stored.inputPosition, 0.9);
});

test('stale-player expiration does not overwrite a heartbeat newer than its cutoff', async () => {
  class HeartbeatDuringExpirationAdapter extends InMemoryDnpAdapter {
    override async expirePlayerIfLastSeenBefore(id: string, cutoff: Date, leftAt: Date) {
      await this.updatePlayer(id, { lastSeenAt: new Date(cutoff.getTime() + 1) });
      return super.expirePlayerIfLastSeenBefore(id, cutoff, leftAt);
    }
  }
  const adapter = new HeartbeatDuringExpirationAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  const joined = await service.joinRoom(created.room.code, 'Second');
  const second = adapter.players.get(joined.playerId)!;
  adapter.players.set(second.id, { ...second, lastSeenAt: new Date(Date.now() - 121_000) });

  const result = await service.pollRoom(created.room.code, created.token);

  assert.equal(adapter.players.get(second.id)?.leftAt, null);
  assert.equal(result.room.players.length, 2);
});

test('public player snapshots include the last accepted input sequence', async () => {
  const adapter = new InMemoryDnpAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');

  const submitted = await service.submitInput(created.room.code, created.token, 0.8, 7);

  assert.equal(submitted.room.players[0].inputSeq, 7);
});

test('accepted input updates only the player and does not write the shared room row', async () => {
  const adapter = new InstrumentedDnpAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  adapter.resetCounts();

  await service.submitInput(created.room.code, created.token, 0.8, 1);

  assert.equal(adapter.playerUpdates, 1);
  assert.equal(adapter.roomUpdates, 0);
});

test('fresh heartbeat poll does not rewrite the player row', async () => {
  const adapter = new InstrumentedDnpAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  adapter.resetCounts();

  await service.pollRoom(created.room.code, created.token);

  assert.equal(adapter.playerUpdates, 0);
  assert.equal(adapter.roomUpdates, 0);
});

test('poll projects a playing simulation before checkpoint cadence without persisting the room', async () => {
  const adapter = new InstrumentedDnpAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  await service.joinRoom(created.room.code, 'Second');
  await service.adminAction(created.room.code, created.token, 'start');
  const stored = [...adapter.rooms.values()][0];
  const lastTickAt = new Date(Date.now() - 100);
  adapter.rooms.set(stored.id, { ...stored, lastTickAt });
  adapter.resetCounts();

  const polled = await service.pollRoom(created.room.code, created.token);
  const after = [...adapter.rooms.values()][0];

  assert.notEqual(polled.room.ball.x, stored.ballX);
  assert.equal(after.ballX, stored.ballX);
  assert.equal(after.lastTickAt.getTime(), lastTickAt.getTime());
  assert.equal(adapter.roomUpdates, 0);
});

test('poll persists an older authoritative simulation checkpoint', async () => {
  const adapter = new InstrumentedDnpAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  await service.joinRoom(created.room.code, 'Second');
  await service.adminAction(created.room.code, created.token, 'start');
  const stored = [...adapter.rooms.values()][0];
  const lastTickAt = new Date(Date.now() - 2_000);
  adapter.rooms.set(stored.id, { ...stored, lastTickAt });
  adapter.resetCounts();

  const polled = await service.pollRoom(created.room.code, created.token);
  const after = [...adapter.rooms.values()][0];

  assert.equal(adapter.roomUpdates, 1);
  assert.equal(after.ballX, polled.room.ball.x);
  assert.ok(after.lastTickAt.getTime() > lastTickAt.getTime());
});

test('seven-day checkpoint discards excess idle time and moves lastTickAt to now', async () => {
  const adapter = new InstrumentedDnpAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  await service.joinRoom(created.room.code, 'Second');
  await service.adminAction(created.room.code, created.token, 'start');
  const stored = [...adapter.rooms.values()][0];
  const lastTickAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  adapter.rooms.set(stored.id, { ...stored, lastTickAt });
  adapter.resetCounts();
  const beforePoll = Date.now();

  const polled = await service.pollRoom(created.room.code, created.token);
  const after = [...adapter.rooms.values()][0];

  assert.equal(adapter.roomUpdates, 1);
  assert.equal(after.ballX, polled.room.ball.x);
  assert.ok(after.lastTickAt.getTime() >= beforePoll);
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

test('stale active player can reconnect by token after a playing private room times out', async () => {
  const { adapter, service, created, joined } = await createWithPlayers(2);
  await service.adminAction(created.room.code, created.token, 'start');
  const second = adapter.players.get(joined[1].playerId)!;
  const staleAt = new Date(Date.now() - 130_000);
  adapter.players.set(second.id, { ...second, lastSeenAt: staleAt });

  const reconnect = await service.joinRoom(created.room.code, 'SecondAgain', joined[1].token);

  assert.equal(reconnect.playerId, joined[1].playerId);
  assert.equal(adapter.players.get(second.id)?.leftAt, null);
  assert.ok((adapter.players.get(second.id)?.lastSeenAt.getTime() ?? 0) > staleAt.getTime());
});

test('stale player can reconnect after a peer poll has already marked it timed out', async () => {
  const { adapter, service, created, joined } = await createWithPlayers(2);
  await service.adminAction(created.room.code, created.token, 'start');
  const second = adapter.players.get(joined[1].playerId)!;
  adapter.players.set(second.id, { ...second, lastSeenAt: new Date(Date.now() - 130_000) });

  await service.pollRoom(created.room.code, created.token);
  assert.ok(adapter.players.get(second.id)?.leftAt);

  const reconnect = await service.joinRoom(created.room.code, 'SecondAgain', joined[1].token);

  assert.equal(reconnect.playerId, joined[1].playerId);
  assert.equal(adapter.players.get(second.id)?.leftAt, null);
});

test('explicitly left player cannot reconnect by token', async () => {
  const { adapter, service, created, joined } = await createWithPlayers(2);
  const oldHash = adapter.players.get(joined[1].playerId)?.tokenHash;
  await service.leaveRoom(created.room.code, joined[1].token);

  assert.notEqual(adapter.players.get(joined[1].playerId)?.tokenHash, oldHash);
  await assert.rejects(
    () => service.joinRoom(created.room.code, 'SecondAgain', joined[1].token),
    (error) => error instanceof DnpServiceError && error.status === 403,
  );
});

test('kicked player cannot reconnect by token', async () => {
  const { adapter, service, created, joined } = await createWithPlayers(2);
  const oldHash = adapter.players.get(joined[1].playerId)?.tokenHash;
  await service.adminAction(created.room.code, created.token, 'kick', { playerId: joined[1].playerId });

  assert.notEqual(adapter.players.get(joined[1].playerId)?.tokenHash, oldHash);
  await assert.rejects(
    () => service.joinRoom(created.room.code, 'SecondAgain', joined[1].token),
    (error) => error instanceof DnpServiceError && error.status === 403,
  );
});

test('concurrent explicit token invalidation cannot be undone by reconnect', async () => {
  class LeaveDuringReconnectAdapter extends InMemoryDnpAdapter {
    invalidateOnRefresh = false;

    override async refreshPlayerIfActive(id: string, name: string, lastSeenAt: Date, expectedTokenHash: string, allowTimedOut = false) {
      if (this.invalidateOnRefresh) {
        this.invalidateOnRefresh = false;
        await this.updatePlayer(id, { leftAt: new Date(), tokenHash: hashDnpToken('concurrent-explicit-leave') });
      }
      return super.refreshPlayerIfActive(id, name, lastSeenAt, expectedTokenHash, allowTimedOut);
    }
  }
  const adapter = new LeaveDuringReconnectAdapter();
  const service = new DnpRoomService(adapter);
  const created = await service.createRoom('Admin');
  const joined = await service.joinRoom(created.room.code, 'Second');
  const second = adapter.players.get(joined.playerId)!;
  adapter.players.set(second.id, { ...second, lastSeenAt: new Date(Date.now() - 130_000), leftAt: new Date() });
  adapter.invalidateOnRefresh = true;

  await assert.rejects(
    () => service.joinRoom(created.room.code, 'SecondAgain', joined.token),
    (error) => error instanceof DnpServiceError && error.status === 403,
  );
  assert.ok(adapter.players.get(second.id)?.leftAt);
  assert.notEqual(adapter.players.get(second.id)?.tokenHash, hashDnpToken(joined.token));
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
