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
  refreshPlayerIfActive(id: string, name: string, lastSeenAt: Date, expectedTokenHash: string, allowTimedOut?: boolean): Promise<DnpStoredPlayer | null>;
  updatePlayerInputIfNewer(id: string, position: number, seq: number, lastSeenAt: Date): Promise<DnpStoredPlayer | null>;
  expirePlayerIfLastSeenBefore(id: string, cutoff: Date, leftAt: Date): Promise<DnpStoredPlayer | null>;
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
const HEARTBEAT_INTERVAL_MS = 10_000;
const SIMULATION_CHECKPOINT_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

function findTokenOwner(players: DnpStoredPlayer[], token: unknown) {
  return players.find((entry) => verifyDnpToken(token, entry.tokenHash));
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
      if (!(error instanceof DnpServiceError) || error.status !== 409) throw error;
      if (attempt === WRITE_RETRIES - 1) throw error;
      await sleep(10 * (attempt + 1) + Math.floor(Math.random() * 15));
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

function projectRoom(room: DnpStoredRoom, players: DnpStoredPlayer[], at: Date) {
  const elapsed = at.getTime() - room.lastTickAt.getTime();
  return elapsed > 0 ? advanceDnpSimulation(toDnpPublicRoom(room, players), elapsed) : toDnpPublicRoom(room, players);
}

async function checkpointRoomIfNeeded(adapter: DnpDataAdapter, room: DnpStoredRoom, players: DnpStoredPlayer[], at = now()) {
  const elapsed = at.getTime() - room.lastTickAt.getTime();
  const projected = projectRoom(room, players, at);
  if (room.status !== 'playing' || elapsed < SIMULATION_CHECKPOINT_MS) return { room, projected };
  const updated = await adapter.updateRoom(room.id, {
    scoreLeft: projected.scores.left,
    scoreRight: projected.scores.right,
    ballX: projected.ball.x,
    ballY: projected.ball.y,
    ballVx: projected.ball.vx,
    ballVy: projected.ball.vy,
    lastTickAt: at,
    version: room.version + 1,
  }, room.version);
  return { room: updated, projected: toDnpPublicRoom(updated, players) };
}

async function expireStalePlayers(adapter: DnpDataAdapter, players: DnpStoredPlayer[], at = now()) {
  let next = players;
  const cutoff = new Date(at.getTime() - STALE_MS);
  for (const player of players) {
    if (!player.leftAt && player.lastSeenAt <= cutoff) {
      const updated = await adapter.expirePlayerIfLastSeenBefore(player.id, cutoff, at);
      if (updated) next = next.map((entry) => (entry.id === updated.id ? updated : entry));
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
      let players = found.players;
      const tokenOwner = findTokenOwner(players, tokenValue);
      if (tokenOwner) {
        // A matching token on a left row denotes timeout expiry: explicit leave/kick
        // rotate the hash. Re-check the hash during reactivation so a concurrent
        // explicit invalidation cannot be undone by this reconnect.
        const player = await tx.refreshPlayerIfActive(tokenOwner.id, name, now(), tokenOwner.tokenHash, true);
        if (!player) throw new DnpServiceError(403, 'Invalid player token.');
        players = players.map((entry) => (entry.id === player.id ? player : entry));
        players = await expireStalePlayers(tx, players);
        const room = await transferAdminIfNeeded(tx, found, players);
        return { room: toDnpPublicRoom(room, players), playerId: player.id, token: tokenValue as string };
      }
      if (tokenValue !== undefined && tokenValue !== null && tokenValue !== '') {
        throw new DnpServiceError(403, 'Invalid player token.');
      }
      players = await expireStalePlayers(tx, players);
      let room = await transferAdminIfNeeded(tx, found, players);
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

  async authenticatePlayer(codeValue: unknown, tokenValue?: unknown) {
    const code = normalizeDnpCode(codeValue);
    if (!code) throw new DnpServiceError(400, 'Invalid room code.');
    const found = await this.adapter.findRoomByCode(code);
    if (!found) throw new DnpServiceError(404, 'Room not found.');
    const player = assertToken(findPlayerByToken(found.players, tokenValue), tokenValue);
    return { roomCode: found.code, playerId: player.id, isAdmin: found.adminPlayerId === player.id };
  }

  async pollRoom(codeValue: unknown, tokenValue?: unknown) {
    const code = normalizeDnpCode(codeValue);
    if (!code) throw new DnpServiceError(400, 'Invalid room code.');
    return withWriteRetry(() => this.adapter.transaction(async (tx) => {
      const found = await tx.findRoomByCode(code);
      if (!found) throw new DnpServiceError(404, 'Room not found.');
      let players = await expireStalePlayers(tx, found.players);
      const tokenPlayer = assertToken(findPlayerByToken(players, tokenValue), tokenValue);
      const at = now();
      if (at.getTime() - tokenPlayer.lastSeenAt.getTime() >= HEARTBEAT_INTERVAL_MS) {
        const updated = await tx.updatePlayer(tokenPlayer.id, { lastSeenAt: at });
        players = players.map((entry) => (entry.id === updated.id ? updated : entry));
      }
      let room = await transferAdminIfNeeded(tx, found, players);
      const checkpoint = await checkpointRoomIfNeeded(tx, room, players, at);
      room = checkpoint.room;
      return { room: checkpoint.projected };
    }));
  }

  async submitInput(codeValue: unknown, tokenValue: unknown, positionValue: unknown, seqValue: unknown) {
    const code = normalizeDnpCode(codeValue);
    if (!code || typeof positionValue !== 'number' || !Number.isFinite(positionValue) || typeof seqValue !== 'number' || !Number.isInteger(seqValue) || seqValue < 0 || seqValue > 2_147_483_647) throw new DnpServiceError(400, 'Invalid input.');
    const position = Math.max(0, Math.min(1, positionValue));
    const seq = seqValue;
    return withWriteRetry(() => this.adapter.transaction(async (tx) => {
      const found = await tx.findRoomByCode(code);
      if (!found) throw new DnpServiceError(404, 'Room not found.');
      let players = await expireStalePlayers(tx, found.players);
      let room = await transferAdminIfNeeded(tx, found, players);
      const player = assertToken(findPlayerByToken(players, tokenValue), tokenValue);
      if (seq > player.inputSeq) {
        const updated = await tx.updatePlayerInputIfNewer(player.id, position, seq, now());
        if (updated) players = players.map((entry) => (entry.id === updated.id ? updated : entry));
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
      const left = await tx.updatePlayer(player.id, {
        leftAt: now(),
        lastSeenAt: now(),
        tokenHash: hashDnpToken(generateDnpToken()),
      });
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
        const kicked = await tx.updatePlayer(target.id, {
          leftAt: now(),
          tokenHash: hashDnpToken(generateDnpToken()),
        });
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
