import { randomUUID } from 'node:crypto';

import {
  DNP_MAX_PLAYERS,
  generateDnpCode,
  generateDnpToken,
  hashDnpToken,
  normalizeDnpCode,
  normalizeDnpName,
  toDnpPublicRoom,
  verifyDnpToken,
  type DnpRoomMode,
  type DnpStoredPlayer,
  type DnpStoredRoom,
} from './domain';
import { advanceDnpSimulation, createDnpBall } from './simulation';

export type DnpDataAdapter = {
  transaction<T>(fn: (tx: DnpDataAdapter) => Promise<T>): Promise<T>;
  findRoomByCode(code: string): Promise<(DnpStoredRoom & { players: DnpStoredPlayer[] }) | null>;
  findMatchmakingCandidate(): Promise<(DnpStoredRoom & { players: DnpStoredPlayer[] }) | null>;
  createRoom(data: Omit<DnpStoredRoom, 'createdAt' | 'updatedAt'>): Promise<DnpStoredRoom>;
  updateRoom(id: string, data: Partial<DnpStoredRoom>, expectedVersion?: number): Promise<DnpStoredRoom>;
  createPlayer(data: Omit<DnpStoredPlayer, 'createdAt'>): Promise<DnpStoredPlayer>;
  updatePlayer(id: string, data: Partial<DnpStoredPlayer>): Promise<DnpStoredPlayer>;
};

export class DnpServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const now = () => new Date();
const activePlayers = (players: DnpStoredPlayer[]) => players.filter((player) => !player.leftAt).sort((a, b) => a.joinOrder - b.joinOrder);
const STALE_MS = 120_000;
const WRITE_RETRIES = 4;

function requireName(name: unknown) {
  const normalized = normalizeDnpName(name);
  if (!normalized) throw new DnpServiceError(400, 'Name must be 1-16 characters.');
  return normalized;
}

function nextSlot(players: DnpStoredPlayer[]) {
  const used = new Set(activePlayers(players).map((player) => player.slotIndex));
  for (let slot = 0; slot < DNP_MAX_PLAYERS; slot += 1) if (!used.has(slot)) return slot;
  throw new DnpServiceError(409, 'Room is full.');
}

function assertToken(player: DnpStoredPlayer | undefined, token: unknown) {
  if (!player || player.leftAt || !verifyDnpToken(token, player.tokenHash)) {
    throw new DnpServiceError(403, 'Invalid player token.');
  }
  return player;
}

function findPlayerByToken(players: DnpStoredPlayer[], token: unknown) {
  return players.find((entry) => !entry.leftAt && verifyDnpToken(token, entry.tokenHash));
}

function assertAdmin(room: DnpStoredRoom, players: DnpStoredPlayer[], token: unknown) {
  const admin = players.find((player) => player.id === room.adminPlayerId && !player.leftAt);
  return assertToken(admin, token);
}

async function withWriteRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof DnpServiceError && error.status !== 409) throw error;
      if (attempt === WRITE_RETRIES - 1) throw error;
    }
  }
  throw lastError;
}

async function transferAdminIfNeeded(adapter: DnpDataAdapter, room: DnpStoredRoom, players: DnpStoredPlayer[]) {
  const active = activePlayers(players);
  if (active.some((player) => player.id === room.adminPlayerId)) return room;
  const adminPlayerId = active[0]?.id ?? null;
  return adapter.updateRoom(room.id, { adminPlayerId, version: room.version + 1 }, room.version);
}

async function advanceRoomIfNeeded(adapter: DnpDataAdapter, room: DnpStoredRoom, players: DnpStoredPlayer[], at = now()) {
  const elapsed = at.getTime() - room.lastTickAt.getTime();
  if (room.status !== 'playing' || elapsed <= 0) return room;
  const advanced = advanceDnpSimulation(toDnpPublicRoom(room, players), elapsed);
  const changed = advanced.scores.left !== room.scoreLeft || advanced.scores.right !== room.scoreRight || advanced.ball.x !== room.ballX || advanced.ball.y !== room.ballY || advanced.ball.vx !== room.ballVx || advanced.ball.vy !== room.ballVy;
  return adapter.updateRoom(room.id, {
    scoreLeft: advanced.scores.left,
    scoreRight: advanced.scores.right,
    ballX: advanced.ball.x,
    ballY: advanced.ball.y,
    ballVx: advanced.ball.vx,
    ballVy: advanced.ball.vy,
    lastTickAt: at,
    version: changed ? room.version + 1 : room.version,
  }, room.version);
}

async function expireStalePlayers(adapter: DnpDataAdapter, players: DnpStoredPlayer[], at = now()) {
  let next = players;
  for (const player of players) {
    if (!player.leftAt && at.getTime() - player.lastSeenAt.getTime() > STALE_MS) {
      const updated = await adapter.updatePlayer(player.id, { leftAt: at });
      next = next.map((entry) => (entry.id === updated.id ? updated : entry));
    }
  }
  return next;
}

export class DnpRoomService {
  constructor(private adapter: DnpDataAdapter) {}

  async createRoom(nameValue: unknown, mode: DnpRoomMode = 'private') {
    const name = requireName(nameValue);
    return this.createNewRoomForName(name, mode);
  }

  private async createNewRoomForName(name: string, mode: DnpRoomMode = 'private') {
    return withWriteRetry(async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = generateDnpCode();
        try {
          return await this.adapter.transaction(async (tx) => {
            const token = generateDnpToken();
            const ball = createDnpBall();
            const room = await tx.createRoom({
              id: randomUUID(), code, mode, status: 'lobby', adminPlayerId: null,
              scoreLeft: 0, scoreRight: 0, ballX: ball.x, ballY: ball.y, ballVx: ball.vx, ballVy: ball.vy,
              version: 1, lastTickAt: now(),
            });
            const player = await tx.createPlayer({
              id: randomUUID(), roomId: room.id, name, joinOrder: 1, slotIndex: 0, tokenHash: hashDnpToken(token),
              inputPosition: 0.5, inputSeq: 0, lastSeenAt: now(), leftAt: null,
            });
            const updated = await tx.updateRoom(room.id, { adminPlayerId: player.id, version: 2 }, room.version);
            return { room: toDnpPublicRoom(updated, [player]), playerId: player.id, token };
          });
        } catch (error) {
          if (error instanceof DnpServiceError && error.status !== 409) throw error;
          if (attempt === 7) throw error;
        }
      }
      throw new DnpServiceError(500, 'Could not create room code.');
    });
  }

  async joinMatchmaking(nameValue: unknown) {
    const name = requireName(nameValue);
    return withWriteRetry(() => this.adapter.transaction(async (tx) => {
      const candidate = await tx.findMatchmakingCandidate();
      if (!candidate) return this.createMatchmakingRoom(tx, name);
      const active = activePlayers(candidate.players);
      if (active.length !== 1) throw new DnpServiceError(409, 'Matchmaking room is not available.');
      const token = generateDnpToken();
      const player = await tx.createPlayer({
        id: randomUUID(), roomId: candidate.id, name, joinOrder: 2, slotIndex: nextSlot(active), tokenHash: hashDnpToken(token),
        inputPosition: 0.5, inputSeq: 0, lastSeenAt: now(), leftAt: null,
      });
      const room = await tx.updateRoom(candidate.id, { status: 'playing', version: candidate.version + 1, lastTickAt: now() }, candidate.version);
      return { room: toDnpPublicRoom(room, [...active, player]), playerId: player.id, token };
    }));
  }

  private async createMatchmakingRoom(tx: DnpDataAdapter, name: string) {
    const token = generateDnpToken();
    const ball = createDnpBall();
    const room = await tx.createRoom({
      id: randomUUID(), code: generateDnpCode(), mode: 'matchmaking', status: 'lobby', adminPlayerId: null,
      scoreLeft: 0, scoreRight: 0, ballX: ball.x, ballY: ball.y, ballVx: ball.vx, ballVy: ball.vy,
      version: 1, lastTickAt: now(),
    });
    const player = await tx.createPlayer({
      id: randomUUID(), roomId: room.id, name, joinOrder: 1, slotIndex: 0, tokenHash: hashDnpToken(token),
      inputPosition: 0.5, inputSeq: 0, lastSeenAt: now(), leftAt: null,
    });
    const updated = await tx.updateRoom(room.id, { adminPlayerId: player.id, version: 2 }, room.version);
    return { room: toDnpPublicRoom(updated, [player]), playerId: player.id, token };
  }

  async joinRoom(codeValue: unknown, nameValue: unknown, tokenValue?: unknown) {
    const code = normalizeDnpCode(codeValue);
    const name = requireName(nameValue);
    if (!code) throw new DnpServiceError(400, 'Invalid room code.');
    return withWriteRetry(() => this.adapter.transaction(async (tx) => {
      const found = await tx.findRoomByCode(code);
      if (!found) throw new DnpServiceError(404, 'Room not found.');
      let players = await expireStalePlayers(tx, found.players);
      let room = await transferAdminIfNeeded(tx, found, players);
      const reconnect = findPlayerByToken(players, tokenValue);
      if (reconnect) {
        const player = await tx.updatePlayer(reconnect.id, { name, lastSeenAt: now(), leftAt: null });
        players = players.map((entry) => (entry.id === player.id ? player : entry));
        room = await transferAdminIfNeeded(tx, room, players);
        return { room: toDnpPublicRoom(room, players), playerId: player.id, token: tokenValue as string };
      }
      if (room.mode === 'matchmaking' || room.status !== 'lobby') throw new DnpServiceError(409, 'Room is not accepting new players.');
      if (activePlayers(players).length >= DNP_MAX_PLAYERS) throw new DnpServiceError(409, 'Room is full.');
      const token = generateDnpToken();
      const player = await tx.createPlayer({
        id: randomUUID(), roomId: room.id, name, joinOrder: Math.max(0, ...players.map((p) => p.joinOrder)) + 1,
        slotIndex: nextSlot(players), tokenHash: hashDnpToken(token), inputPosition: 0.5, inputSeq: 0, lastSeenAt: now(), leftAt: null,
      });
      room = await tx.updateRoom(room.id, { adminPlayerId: room.adminPlayerId ?? player.id, version: room.version + 1 }, room.version);
      return { room: toDnpPublicRoom(room, [...players, player]), playerId: player.id, token };
    }));
  }

  async pollRoom(codeValue: unknown, tokenValue?: unknown) {
    const code = normalizeDnpCode(codeValue);
    if (!code) throw new DnpServiceError(400, 'Invalid room code.');
    return withWriteRetry(() => this.adapter.transaction(async (tx) => {
      const found = await tx.findRoomByCode(code);
      if (!found) throw new DnpServiceError(404, 'Room not found.');
      let players = await expireStalePlayers(tx, found.players);
      const tokenPlayer = assertToken(findPlayerByToken(players, tokenValue), tokenValue);
      const updated = await tx.updatePlayer(tokenPlayer.id, { lastSeenAt: now() });
      players = players.map((entry) => (entry.id === updated.id ? updated : entry));
      let room = await transferAdminIfNeeded(tx, found, players);
      room = await advanceRoomIfNeeded(tx, room, players);
      return { room: toDnpPublicRoom(room, players) };
    }));
  }

  async submitInput(codeValue: unknown, tokenValue: unknown, positionValue: unknown, seqValue: unknown) {
    const code = normalizeDnpCode(codeValue);
    if (!code || typeof positionValue !== 'number' || typeof seqValue !== 'number') throw new DnpServiceError(400, 'Invalid input.');
    const position = Math.max(0, Math.min(1, positionValue));
    return withWriteRetry(() => this.adapter.transaction(async (tx) => {
      const found = await tx.findRoomByCode(code);
      if (!found) throw new DnpServiceError(404, 'Room not found.');
      let players = await expireStalePlayers(tx, found.players);
      let room = await transferAdminIfNeeded(tx, found, players);
      const player = assertToken(findPlayerByToken(players, tokenValue), tokenValue);
      room = await advanceRoomIfNeeded(tx, room, players);
      if (seqValue > player.inputSeq) {
        const updated = await tx.updatePlayer(player.id, { inputPosition: position, inputSeq: seqValue, lastSeenAt: now() });
        players = players.map((entry) => (entry.id === updated.id ? updated : entry));
        room = await tx.updateRoom(room.id, { version: room.version + 1 }, room.version);
      }
      return { ok: true, room: toDnpPublicRoom(room, players) };
    }));
  }

  async leaveRoom(codeValue: unknown, tokenValue: unknown) {
    const code = normalizeDnpCode(codeValue);
    if (!code) throw new DnpServiceError(400, 'Invalid room code.');
    return withWriteRetry(() => this.adapter.transaction(async (tx) => {
      const found = await tx.findRoomByCode(code);
      if (!found) throw new DnpServiceError(404, 'Room not found.');
      let players = await expireStalePlayers(tx, found.players);
      let room = await transferAdminIfNeeded(tx, found, players);
      const player = assertToken(findPlayerByToken(players, tokenValue), tokenValue);
      const left = await tx.updatePlayer(player.id, { leftAt: now(), lastSeenAt: now() });
      players = players.map((entry) => (entry.id === left.id ? left : entry));
      room = await transferAdminIfNeeded(tx, room, players);
      return { room: toDnpPublicRoom(room, players) };
    }));
  }

  async adminAction(codeValue: unknown, tokenValue: unknown, action: unknown, payload: Record<string, unknown> = {}) {
    const code = normalizeDnpCode(codeValue);
    if (!code || typeof action !== 'string') throw new DnpServiceError(400, 'Invalid admin request.');
    return withWriteRetry(() => this.adapter.transaction(async (tx) => {
      const found = await tx.findRoomByCode(code);
      if (!found) throw new DnpServiceError(404, 'Room not found.');
      let players = await expireStalePlayers(tx, found.players);
      let room = await transferAdminIfNeeded(tx, found, players);
      assertAdmin(room, players, tokenValue);
      if (action === 'start') {
        if (activePlayers(players).length < 2) throw new DnpServiceError(409, 'Need at least two players to start.');
        room = await tx.updateRoom(room.id, { status: 'playing', version: room.version + 1, lastTickAt: now() }, room.version);
      } else if (action === 'restart') {
        const ball = createDnpBall();
        room = await tx.updateRoom(room.id, { status: 'playing', scoreLeft: 0, scoreRight: 0, ballX: ball.x, ballY: ball.y, ballVx: ball.vx, ballVy: ball.vy, version: room.version + 1, lastTickAt: now() }, room.version);
      } else if (action === 'kick') {
        const targetId = String(payload.playerId ?? '');
        if (targetId === room.adminPlayerId) throw new DnpServiceError(400, 'Cannot kick admin.');
        const target = players.find((player) => player.id === targetId && !player.leftAt);
        if (!target) throw new DnpServiceError(404, 'Player not found.');
        const kicked = await tx.updatePlayer(target.id, { leftAt: now() });
        players = players.map((entry) => (entry.id === kicked.id ? kicked : entry));
        room = await tx.updateRoom(room.id, { version: room.version + 1 }, room.version);
      } else if (action === 'transfer') {
        const targetId = String(payload.playerId ?? '');
        if (!players.some((player) => player.id === targetId && !player.leftAt)) throw new DnpServiceError(404, 'Player not found.');
        room = await tx.updateRoom(room.id, { adminPlayerId: targetId, version: room.version + 1 }, room.version);
      } else if (action === 'reassign') {
        const assignments = payload.assignments as Record<string, number> | undefined;
        if (!assignments) throw new DnpServiceError(400, 'Missing assignments.');
        const active = activePlayers(players);
        if (Object.keys(assignments).length !== active.length || !active.every((player) => Object.prototype.hasOwnProperty.call(assignments, player.id))) throw new DnpServiceError(400, 'Assignments must include every active player.');
        const slots = active.map((player) => assignments[player.id]);
        if (new Set(slots).size !== slots.length || slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= DNP_MAX_PLAYERS)) throw new DnpServiceError(400, 'Invalid slot assignments.');
        for (const [playerId, slotIndex] of Object.entries(assignments)) {
          const player = players.find((entry) => entry.id === playerId && !entry.leftAt);
          if (!player) throw new DnpServiceError(404, 'Player not found.');
          const updated = await tx.updatePlayer(playerId, { slotIndex });
          players = players.map((entry) => (entry.id === playerId ? updated : entry));
        }
        room = await tx.updateRoom(room.id, { version: room.version + 1 }, room.version);
      } else {
        throw new DnpServiceError(400, 'Unsupported admin action.');
      }
      return { room: toDnpPublicRoom(room, players) };
    }));
  }
}
