import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const DNP_MAX_PLAYERS = 12;
export const DNP_CODE_LENGTH = 6;
export const DNP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type DnpRoomMode = 'private' | 'matchmaking';
export type DnpRoomStatus = 'lobby' | 'playing' | 'ended';
export type DnpAdminAction = 'start' | 'restart' | 'reassign' | 'kick' | 'transfer';

export type DnpSlotKind = 'side' | 'top' | 'bottom';
export type DnpHalf = 'left' | 'right';

export type DnpSlot = {
  index: number;
  baseIndex: number;
  subIndex: 0 | 1;
  half: DnpHalf;
  kind: DnpSlotKind;
  label: string;
};

const baseSlots: Array<Omit<DnpSlot, 'index' | 'baseIndex' | 'subIndex' | 'label'>> = [
  { half: 'left', kind: 'side' },
  { half: 'right', kind: 'side' },
  { half: 'left', kind: 'top' },
  { half: 'right', kind: 'top' },
  { half: 'left', kind: 'bottom' },
  { half: 'right', kind: 'bottom' },
];

export function normalizeDnpName(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > 16) return null;
  return trimmed;
}

export function normalizeDnpCode(value: unknown) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (!new RegExp(`^[${DNP_CODE_ALPHABET}]{${DNP_CODE_LENGTH}}$`).test(code)) return null;
  return code;
}

export function generateDnpCode(randomBytesFn: (size: number) => Uint8Array = randomBytes) {
  const bytes = randomBytesFn(DNP_CODE_LENGTH);
  let code = '';
  for (let index = 0; index < DNP_CODE_LENGTH; index += 1) {
    code += DNP_CODE_ALPHABET[bytes[index] % DNP_CODE_ALPHABET.length];
  }
  return code;
}

export function generateDnpToken() {
  return randomBytes(24).toString('base64url');
}

export function hashDnpToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyDnpToken(token: unknown, tokenHash: string) {
  if (typeof token !== 'string') return false;
  const candidate = Buffer.from(hashDnpToken(token), 'hex');
  const expected = Buffer.from(tokenHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function getDnpSlot(index: number): DnpSlot {
  if (!Number.isInteger(index) || index < 0 || index >= DNP_MAX_PLAYERS) {
    throw new RangeError('slot index must be between 0 and 11');
  }
  const baseIndex = index % 6;
  const subIndex = index >= 6 ? 1 : 0;
  const base = baseSlots[baseIndex];
  return {
    index,
    baseIndex,
    subIndex,
    ...base,
    label: `${base.half} ${base.kind}${subIndex ? ' B' : ' A'}`,
  };
}

export function allocateDnpSlots(count: number) {
  if (!Number.isInteger(count) || count < 0 || count > DNP_MAX_PLAYERS) {
    throw new RangeError('player count must be between 0 and 12');
  }
  return Array.from({ length: count }, (_, index) => getDnpSlot(index));
}

export function getDnpSlotGeometry(slotIndex: number, width = 1000, height = 600) {
  const slot = getDnpSlot(slotIndex);
  const hasSplit = slot.subIndex === 1;
  const sideThickness = Math.max(12, Math.round(width * 0.018));
  const sideLength = hasSplit ? Math.round(height * 0.16) : Math.round(height * 0.24);
  const topBottomLength = hasSplit ? Math.round(width * 0.13) : Math.round(width * 0.19);
  const topBottomThickness = Math.max(12, Math.round(height * 0.026));
  const gap = 22;

  if (slot.kind === 'side') {
    const x = slot.half === 'left' ? Math.round(width * 0.04) : Math.round(width * 0.96) - sideThickness;
    const centerY = slot.subIndex === 0 ? height * 0.38 : height * 0.62;
    return { x, y: Math.round(centerY - sideLength / 2), width: sideThickness, height: sideLength, axis: 'y' as const };
  }

  const y = slot.kind === 'top' ? gap : height - gap - topBottomThickness;
  const halfStart = slot.half === 'left' ? gap : width / 2 + gap;
  const halfEnd = slot.half === 'left' ? width / 2 - gap : width - gap;
  const halfWidth = halfEnd - halfStart;
  const centerX = slot.subIndex === 0 ? halfStart + halfWidth * 0.35 : halfStart + halfWidth * 0.65;
  return { x: Math.round(centerX - topBottomLength / 2), y: Math.round(y), width: topBottomLength, height: topBottomThickness, axis: 'x' as const };
}

export type DnpPublicPlayer = {
  id: string;
  name: string;
  joinOrder: number;
  slotIndex: number;
  isAdmin: boolean;
  online: boolean;
  input: number;
};

export type DnpPublicRoom = {
  code: string;
  mode: DnpRoomMode;
  status: DnpRoomStatus;
  version: number;
  adminPlayerId: string | null;
  scores: { left: number; right: number };
  ball: { x: number; y: number; vx: number; vy: number };
  players: DnpPublicPlayer[];
};

export function toDnpPublicRoom(room: DnpStoredRoom, players: DnpStoredPlayer[]): DnpPublicRoom {
  return {
    code: room.code,
    mode: room.mode,
    status: room.status,
    version: room.version,
    adminPlayerId: room.adminPlayerId,
    scores: { left: room.scoreLeft, right: room.scoreRight },
    ball: { x: room.ballX, y: room.ballY, vx: room.ballVx, vy: room.ballVy },
    players: players
      .filter((player) => !player.leftAt)
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((player) => ({
        id: player.id,
        name: player.name,
        joinOrder: player.joinOrder,
        slotIndex: player.slotIndex,
        isAdmin: player.id === room.adminPlayerId,
        online: Date.now() - player.lastSeenAt.getTime() < 30_000,
        input: player.inputPosition,
      })),
  };
}

export type DnpStoredRoom = {
  id: string;
  code: string;
  mode: DnpRoomMode;
  status: DnpRoomStatus;
  adminPlayerId: string | null;
  scoreLeft: number;
  scoreRight: number;
  ballX: number;
  ballY: number;
  ballVx: number;
  ballVy: number;
  version: number;
  lastTickAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type DnpStoredPlayer = {
  id: string;
  roomId: string;
  name: string;
  joinOrder: number;
  slotIndex: number;
  tokenHash: string;
  inputPosition: number;
  inputSeq: number;
  lastSeenAt: Date;
  leftAt: Date | null;
  createdAt: Date;
};
