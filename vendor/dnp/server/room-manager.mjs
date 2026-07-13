import { customAlphabet } from 'nanoid';
import { config } from './config.mjs';
import { createPlayer, createRoom, SLOT_NAMES } from './models.mjs';
import { safeSend } from './utils/validate.mjs';
import { createGame, restartGame } from './game/state.mjs';

const makeCode = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

export const rooms = new Map();

function now() {
  return Date.now();
}

function humans(room) {
  return [...room.players.values()].filter((player) => !player.isAi);
}

function clients(room) {
  return humans(room).filter((player) => player.socket?.readyState === 1);
}

function playerSummary(player) {
  return {
    id: player.id,
    name: player.name,
    isAi: player.isAi,
    slot: player.slot,
    subIndex: player.subIndex,
    joinedAt: player.joinedAt,
  };
}

export function serializeRoom(room) {
  return {
    code: room.code,
    createdAt: room.createdAt,
    status: room.status,
    adminPlayerId: room.adminPlayerId,
    isSinglePlayer: room.isSinglePlayer,
    isMatchmakingRoom: room.isMatchmakingRoom,
    players: [...room.players.values()].map(playerSummary),
  };
}

export function sendRoomState(sessionOrSocket, room) {
  const socket = sessionOrSocket?.socket || sessionOrSocket;
  const session = sessionOrSocket?.socket ? sessionOrSocket : socket?._dnpSession;
  const state = serializeRoom(room);
  safeSend(socket, {
    type: 'room_state',
    ...state,
    room: state,
    playerId: session?.playerId || null,
    isAdmin: Boolean(session?.playerId && room.adminPlayerId === session.playerId),
    shareUrl: room.code ? `${config.basePath}/join/${room.code}` : null,
  });
}

export function broadcastRoomState(room) {
  for (const player of clients(room)) sendRoomState(player.socket._dnpSession || player.socket, room);
}

export function broadcast(room, payload) {
  for (const player of clients(room)) safeSend(player.socket, payload);
}

export function getRoom(code) {
  return rooms.get(code) || null;
}

export function getSessionRoom(session) {
  return session?.roomCode ? getRoom(session.roomCode) : null;
}

export function generateRoomCode() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = makeCode();
    if (!rooms.has(code)) return code;
  }
  throw new Error('Unable to allocate room code');
}

export function ensureNamed(session) {
  return typeof session?.name === 'string' && session.name.length > 0;
}

export function touch(room) {
  if (room) room.lastActiveAt = now();
}

function usedSlotCounts(room) {
  const counts = new Map(SLOT_NAMES.map((slot) => [slot, 0]));
  for (const player of room.players.values()) {
    if (player.slot) counts.set(player.slot, (counts.get(player.slot) || 0) + 1);
  }
  return counts;
}

export function assignNextSlot(room, player, preferredSlot = null) {
  const counts = usedSlotCounts(room);
  const slot = SLOT_NAMES.includes(preferredSlot)
    ? preferredSlot
    : SLOT_NAMES.reduce((best, candidate) => (counts.get(candidate) < counts.get(best) ? candidate : best), SLOT_NAMES[0]);

  player.slot = slot;
  player.subIndex = counts.get(slot) || 0;
  return player;
}

export function assignSlot(room, playerId, slot) {
  if (!SLOT_NAMES.includes(slot)) return { ok: false, error: 'Invalid slot' };
  const player = room.players.get(playerId);
  if (!player) return { ok: false, error: 'Player not found' };

  player.slot = slot;
  rebalanceSubIndexes(room);
  touch(room);
  broadcastRoomState(room);
  return { ok: true, player };
}

function rebalanceSubIndexes(room) {
  const counts = new Map(SLOT_NAMES.map((candidate) => [candidate, 0]));
  for (const player of [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)) {
    if (!player.slot) continue;
    const count = counts.get(player.slot) || 0;
    player.subIndex = count;
    counts.set(player.slot, count + 1);
  }
}

export function createRoomForSession(session, options = {}) {
  if (!ensureNamed(session)) return { ok: false, error: 'Set a name first' };
  leaveCurrentRoom(session);

  const code = options.code || generateRoomCode();
  const player = createPlayer({ name: session.name, socket: session.socket });
  const room = createRoom({
    code,
    adminPlayerId: player.id,
    isSinglePlayer: Boolean(options.isSinglePlayer),
    isMatchmakingRoom: Boolean(options.isMatchmakingRoom),
  });

  assignNextSlot(room, player, options.preferredSlot || 'left_side');
  room.players.set(player.id, player);
  rooms.set(code, room);

  session.playerId = player.id;
  session.roomCode = code;
  session.inputDirection = 0;
  touch(room);
  return { ok: true, room, player };
}

export function joinRoom(session, room) {
  if (!ensureNamed(session)) return { ok: false, error: 'Set a name first' };
  if (!room) return { ok: false, error: 'Room not found' };
  if (room.status !== 'lobby' && !room.isMatchmakingRoom) return { ok: false, error: 'Game already started' };
  if (humans(room).length >= config.maxPlayersPerRoom) return { ok: false, error: 'Room is full' };

  leaveCurrentRoom(session);
  const player = createPlayer({ name: session.name, socket: session.socket });
  assignNextSlot(room, player);
  room.players.set(player.id, player);

  if (!room.adminPlayerId) room.adminPlayerId = player.id;
  session.playerId = player.id;
  session.roomCode = room.code;
  session.inputDirection = 0;
  touch(room);
  broadcastRoomState(room);
  return { ok: true, room, player };
}

export function findOpenMatchmakingRoom(excludeSession = null) {
  for (const room of rooms.values()) {
    if (!room.isMatchmakingRoom || room.status !== 'lobby') continue;
    const roomHumans = humans(room);
    if (roomHumans.length !== 1) continue;
    if (excludeSession && roomHumans[0].id === excludeSession.playerId) continue;
    return room;
  }
  return null;
}

export function joinRandom(session) {
  if (!ensureNamed(session)) return { ok: false, error: 'Set a name first' };
  const waitingRoom = findOpenMatchmakingRoom(session);
  if (waitingRoom) {
    const result = joinRoom(session, waitingRoom);
    if (!result.ok) return result;
    startRoom(waitingRoom);
    return { ...result, matched: true };
  }

  const result = createRoomForSession(session, { isMatchmakingRoom: true });
  if (result.ok) broadcastRoomState(result.room);
  return { ...result, matched: false };
}

export function createSinglePlayerRoom(session) {
  const result = createRoomForSession(session, { isSinglePlayer: true, preferredSlot: 'left_side' });
  if (!result.ok) return result;

  const ai = createPlayer({ name: 'Server AI', isAi: true });
  ai.slot = 'right_side';
  ai.subIndex = 0;
  result.room.players.set(ai.id, ai);
  startRoom(result.room);
  return { ...result, ai };
}

export function startRoom(room) {
  if (!room) return { ok: false, error: 'Room not found' };
  if (!room.isSinglePlayer && humans(room).length < 2) return { ok: false, error: 'Need at least 2 human players to start' };
  if (room.status !== 'playing') {
    room.status = 'playing';
    room.game = createGame(room);
  }
  touch(room);
  broadcastRoomState(room);
  return { ok: true, room };
}

export function restartRoom(room) {
  if (!room) return { ok: false, error: 'Room not found' };
  room.status = 'playing';
  room.game = restartGame(room);
  touch(room);
  broadcastRoomState(room);
  return { ok: true, room };
}

export function kickPlayer(room, playerId) {
  if (!room) return { ok: false, error: 'Room not found' };
  const player = room.players.get(playerId);
  if (!player || player.isAi) return { ok: false, error: 'Player not found' };

  safeSend(player.socket, { type: 'error', message: 'You were kicked from the room' });
  if (player.socket?._dnpSession) {
    player.socket._dnpSession.playerId = null;
    player.socket._dnpSession.roomCode = null;
    player.socket._dnpSession.inputDirection = 0;
  }
  room.players.delete(playerId);
  transferAdmin(room);
  touch(room);
  cleanupRoomIfEmpty(room);
  if (rooms.has(room.code)) broadcastRoomState(room);
  return { ok: true };
}

export function transferAdmin(room) {
  if (!room || (room.adminPlayerId && room.players.has(room.adminPlayerId))) return;
  const nextAdmin = humans(room)[0];
  room.adminPlayerId = nextAdmin?.id || null;
}

export function leaveCurrentRoom(session) {
  const room = getSessionRoom(session);
  if (!room) {
    if (session) {
      session.playerId = null;
      session.roomCode = null;
      session.inputDirection = 0;
    }
    return null;
  }

  if (session.playerId) room.players.delete(session.playerId);
  if (session) {
    session.playerId = null;
    session.roomCode = null;
    session.inputDirection = 0;
  }

  transferAdmin(room);
  touch(room);
  cleanupRoomIfEmpty(room);
  if (rooms.has(room.code)) broadcastRoomState(room);
  return room;
}

export function cleanupRoomIfEmpty(room) {
  if (!room) return false;
  if (humans(room).length === 0) {
    rooms.delete(room.code);
    return true;
  }
  return false;
}

export function cleanupStaleRooms() {
  const cutoff = now();
  for (const room of rooms.values()) {
    const humanCount = humans(room).length;
    const ttlMs = room.isMatchmakingRoom ? config.matchmakingEmptyTtlMs : config.emptyRoomTtlMs;
    if (humanCount === 0 && cutoff - room.lastActiveAt > ttlMs) rooms.delete(room.code);
  }
}
