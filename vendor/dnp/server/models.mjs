import { nanoid } from 'nanoid';

export const SLOT_NAMES = ['left_side', 'left_top', 'left_bottom', 'right_side', 'right_top', 'right_bottom'];
export const LEFT_SLOTS = ['left_side', 'left_top', 'left_bottom'];
export const RIGHT_SLOTS = ['right_side', 'right_top', 'right_bottom'];

export function createPlayer({ name, socket = null, isAi = false }) {
  return {
    id: isAi ? `ai_${nanoid(8)}` : `p_${nanoid(12)}`,
    name,
    socket,
    isAi,
    joinedAt: Date.now(),
    inputDirection: 0,
    slot: null,
    subIndex: 0,
  };
}

export function createRoom({ code, adminPlayerId = null, isSinglePlayer = false, isMatchmakingRoom = false }) {
  return {
    code,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    status: 'lobby',
    adminPlayerId,
    players: new Map(),
    game: null,
    isSinglePlayer,
    isMatchmakingRoom,
  };
}

export function teamForSlot(slot) {
  return slot?.startsWith('left_') ? 'left' : 'right';
}

export function slotLabel(slot) {
  return String(slot || '').replace('_', ' ');
}
