import { config } from './config.mjs';
import {
  assignSlot,
  broadcastRoomState,
  createRoomForSession,
  createSinglePlayerRoom,
  getRoom,
  getSessionRoom,
  joinRandom,
  joinRoom,
  kickPlayer,
  leaveCurrentRoom,
  restartRoom,
  sendRoomState,
  startRoom,
} from './room-manager.mjs';
import { normalizeName, normalizeRoomCode, sendError, validateDirection } from './utils/validate.mjs';

const ADMIN_MESSAGES = new Set(['admin_start', 'admin_restart', 'admin_assign', 'admin_kick']);
const MESSAGE_TYPES = new Set([
  'set_name',
  'create_room',
  'join_room',
  'join_random',
  'single_player',
  'input',
  ...ADMIN_MESSAGES,
]);

export function createSession(socket) {
  return {
    socket,
    playerId: null,
    name: null,
    roomCode: null,
    inputDirection: 0,
    connectedAt: Date.now(),
    lastInputAt: 0,
    lastMessageAt: Date.now(),
    isAlive: true,
  };
}

function requireRoom(session) {
  const room = getSessionRoom(session);
  if (!room) sendError(session, 'Join a room first');
  return room;
}

function requireAdmin(session) {
  const room = requireRoom(session);
  if (!room) return null;
  if (room.adminPlayerId !== session.playerId) {
    sendError(session, 'Admin only');
    return null;
  }
  return room;
}

function updateSessionPlayerName(session, name) {
  const room = getSessionRoom(session);
  const player = room?.players.get(session.playerId);
  if (player) {
    player.name = name;
    broadcastRoomState(room);
  }
}

function handleSetName(session, message) {
  const name = normalizeName(message.name);
  if (!name) return sendError(session, 'Invalid name');
  session.name = name;
  updateSessionPlayerName(session, name);

  const room = getSessionRoom(session);
  if (room) return sendRoomState(session, room);
  return session.socket.send(JSON.stringify({ type: 'room_state', room: null, playerId: session.playerId, name }));
}

function handleCreateRoom(session) {
  const result = createRoomForSession(session);
  if (!result.ok) return sendError(session, result.error);
  return sendRoomState(session, result.room);
}

function handleJoinRoom(session, message) {
  const code = normalizeRoomCode(message.code);
  if (!code) return sendError(session, 'Invalid room code');
  const result = joinRoom(session, getRoom(code));
  if (!result.ok) return sendError(session, result.error);
  return sendRoomState(session, result.room);
}

function handleJoinRandom(session) {
  const result = joinRandom(session);
  if (!result.ok) return sendError(session, result.error);
  return sendRoomState(session, result.room);
}

function handleSinglePlayer(session) {
  const result = createSinglePlayerRoom(session);
  if (!result.ok) return sendError(session, result.error);
  return sendRoomState(session, result.room);
}

function handleInput(session, message) {
  const direction = message.direction;
  if (!validateDirection(direction)) return sendError(session, 'Invalid input direction');

  const timestamp = Date.now();
  if (timestamp - session.lastInputAt < config.inputRateLimitMs) return;
  session.lastInputAt = timestamp;
  session.inputDirection = direction;

  const room = requireRoom(session);
  const player = room?.players.get(session.playerId);
  if (player) {
    player.inputDirection = direction;
    room.lastActiveAt = timestamp;
  }
}

function handleAdminStart(session) {
  const room = requireAdmin(session);
  if (!room) return;
  const result = startRoom(room);
  if (!result.ok) return sendError(session, result.error);
}

function handleAdminRestart(session) {
  const room = requireAdmin(session);
  if (!room) return;
  const result = restartRoom(room);
  if (!result.ok) return sendError(session, result.error);
}

function handleAdminAssign(session, message) {
  const room = requireAdmin(session);
  if (!room) return;
  if (typeof message.playerId !== 'string' || typeof message.slot !== 'string') return sendError(session, 'Invalid assignment');
  const result = assignSlot(room, message.playerId, message.slot);
  if (!result.ok) return sendError(session, result.error);
}

function handleAdminKick(session, message) {
  const room = requireAdmin(session);
  if (!room) return;
  if (typeof message.playerId !== 'string') return sendError(session, 'Invalid player');
  if (message.playerId === session.playerId) return sendError(session, 'Admin cannot kick self');
  const result = kickPlayer(room, message.playerId);
  if (!result.ok) return sendError(session, result.error);
}

export function handleClientMessage(session, rawData) {
  session.lastMessageAt = Date.now();

  let message;
  try {
    const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData);
    message = JSON.parse(text);
  } catch {
    sendError(session, 'Invalid JSON');
    return;
  }

  if (!message || typeof message !== 'object' || Array.isArray(message)) return sendError(session, 'Invalid message');
  if (typeof message.type !== 'string' || !MESSAGE_TYPES.has(message.type)) return sendError(session, 'Unknown message type');

  switch (message.type) {
    case 'set_name':
      return handleSetName(session, message);
    case 'create_room':
      return handleCreateRoom(session);
    case 'join_room':
      return handleJoinRoom(session, message);
    case 'join_random':
      return handleJoinRandom(session);
    case 'single_player':
      return handleSinglePlayer(session);
    case 'input':
      return handleInput(session, message);
    case 'admin_start':
      return handleAdminStart(session);
    case 'admin_restart':
      return handleAdminRestart(session);
    case 'admin_assign':
      return handleAdminAssign(session, message);
    case 'admin_kick':
      return handleAdminKick(session, message);
    default:
      return sendError(session, 'Unhandled message type');
  }
}

export function attachProtocol(wss) {
  wss.on('connection', (socket) => {
    const session = createSession(socket);
    socket._dnpSession = session;

    socket.on('pong', () => {
      session.isAlive = true;
    });

    socket.on('message', (data) => handleClientMessage(session, data));

    socket.on('error', () => {});

    socket.on('close', () => {
      leaveCurrentRoom(session);
    });
  });
}
