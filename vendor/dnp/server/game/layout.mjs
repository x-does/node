import { config, gameConstants } from '../config.mjs';

export const ARENA_WIDTH = config.arena.width;
export const ARENA_HEIGHT = config.arena.height;

export const SLOT_NAMES = ['left_side', 'left_top', 'left_bottom', 'right_side', 'right_top', 'right_bottom'];
export const SIDE_SLOTS = new Set(['left_side', 'right_side']);
export const TOP_SLOTS = new Set(['left_top', 'right_top']);
export const BOTTOM_SLOTS = new Set(['left_bottom', 'right_bottom']);
export const EDGE_SLOTS = new Set(['left_top', 'left_bottom', 'right_top', 'right_bottom']);

export function teamForSlot(slot) {
  return String(slot || '').startsWith('left_') ? 'left' : 'right';
}

export function axisForSlot(slot) {
  return SIDE_SLOTS.has(slot) ? 'y' : 'x';
}

export function isSideSlot(slot) {
  return SIDE_SLOTS.has(slot);
}

export function isEdgeSlot(slot) {
  return EDGE_SLOTS.has(slot);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hasSplit(slot, slotCounts) {
  return (slotCounts?.get?.(slot) || 0) > 1;
}

function subIndexFor(player) {
  return clamp(Number(player?.subIndex || 0), 0, 1);
}

export function slotBounds(slot, player = null, slotCounts = new Map()) {
  const { paddleThickness, sidePaddleLength, edgePaddleLength, paddleInset, splitGap } = gameConstants;
  const side = isSideSlot(slot);
  const width = side ? paddleThickness : edgePaddleLength;
  const height = side ? sidePaddleLength : paddleThickness;
  const x = slot === 'left_side' ? paddleInset : slot === 'right_side' ? ARENA_WIDTH - paddleInset - paddleThickness : null;
  const y = TOP_SLOTS.has(slot) ? paddleInset : BOTTOM_SLOTS.has(slot) ? ARENA_HEIGHT - paddleInset - paddleThickness : null;

  if (side) {
    let min = 0;
    let max = ARENA_HEIGHT - height;
    if (hasSplit(slot, slotCounts)) {
      const half = ARENA_HEIGHT / 2;
      if (subIndexFor(player) === 0) {
        min = 0;
        max = half - splitGap / 2 - height;
      } else {
        min = half + splitGap / 2;
        max = ARENA_HEIGHT - height;
      }
    }
    return { slot, axis: 'y', x, y: null, width, height, min, max };
  }

  const teamLeft = teamForSlot(slot) === 'left';
  let min = teamLeft ? 0 : ARENA_WIDTH / 2;
  let max = (teamLeft ? ARENA_WIDTH / 2 : ARENA_WIDTH) - width;
  if (hasSplit(slot, slotCounts)) {
    const teamMin = teamLeft ? 0 : ARENA_WIDTH / 2;
    const teamMax = teamLeft ? ARENA_WIDTH / 2 : ARENA_WIDTH;
    const half = (teamMin + teamMax) / 2;
    if (subIndexFor(player) === 0) {
      min = teamMin;
      max = half - splitGap / 2 - width;
    } else {
      min = half + splitGap / 2;
      max = teamMax - width;
    }
  }
  return { slot, axis: 'x', x: null, y, width, height, min, max };
}

export function defaultPositionFor(slot, player = null, slotCounts = new Map()) {
  const bounds = slotBounds(slot, player, slotCounts);
  return (bounds.min + bounds.max) / 2;
}

export function paddleRect(paddle) {
  return {
    x: paddle.x,
    y: paddle.y,
    width: paddle.width,
    height: paddle.height,
    left: paddle.x,
    right: paddle.x + paddle.width,
    top: paddle.y,
    bottom: paddle.y + paddle.height,
  };
}

export function makePaddle(player, slotCounts = new Map(), previous = null) {
  const slot = player.slot;
  const bounds = slotBounds(slot, player, slotCounts);
  const position = clamp(previous?.position ?? defaultPositionFor(slot, player, slotCounts), bounds.min, bounds.max);
  const side = bounds.axis === 'y';
  return {
    id: player.id,
    playerId: player.id,
    name: player.name,
    isAi: Boolean(player.isAi),
    slot,
    subIndex: subIndexFor(player),
    team: teamForSlot(slot),
    axis: bounds.axis,
    position,
    x: side ? bounds.x : position,
    y: side ? position : bounds.y,
    width: bounds.width,
    height: bounds.height,
    w: bounds.width,
    h: bounds.height,
    inputDirection: Number(player.inputDirection || 0),
    lastHitAt: previous?.lastHitAt ?? -Infinity,
  };
}

export function slotCountsForRoom(room) {
  const counts = new Map(SLOT_NAMES.map((slot) => [slot, 0]));
  for (const player of room?.players?.values?.() || []) {
    if (SLOT_NAMES.includes(player.slot)) counts.set(player.slot, (counts.get(player.slot) || 0) + 1);
  }
  return counts;
}
