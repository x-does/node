import type { DnpPublicRoom } from '@/lib/dnp/domain';
import { advanceDnpSimulation } from '@/lib/dnp/simulation';

export const DNP_INPUT_INTERVAL_MS = 200;
export const DNP_POLL_INTERVAL_MS = 500;
export const DNP_INPUT_EPSILON = 0.004;

export type DnpInputDeliveryState = {
  acknowledgedPosition: number | null;
  sequence: number;
  pending: { position: number; seq: number } | null;
};

export function clampDnpInput(position: number) {
  return Math.max(0, Math.min(1, position));
}

export function shouldSendDnpInput(previous: number | null, next: number, epsilon = DNP_INPUT_EPSILON) {
  return previous === null || Math.abs(next - previous) >= epsilon;
}

export function queueDnpInput(state: DnpInputDeliveryState, position: number): DnpInputDeliveryState {
  if (state.pending || !shouldSendDnpInput(state.acknowledgedPosition, position)) return state;
  return { ...state, pending: { position, seq: state.sequence + 1 } };
}

export function acknowledgeDnpInput(state: DnpInputDeliveryState, seq: number): DnpInputDeliveryState {
  if (!state.pending || state.pending.seq !== seq) return state;
  return { acknowledgedPosition: state.pending.position, sequence: seq, pending: null };
}

export function initializeDnpInputSequence(current: number, room: DnpPublicRoom, playerId: string) {
  return Math.max(current, room.players.find((player) => player.id === playerId)?.inputSeq ?? 0);
}

export function applyLocalDnpInput(room: DnpPublicRoom, playerId: string, position: number): DnpPublicRoom {
  return {
    ...room,
    players: room.players.map((player) => player.id === playerId ? { ...player, input: clampDnpInput(position) } : player),
  };
}

export function projectDnpRoom(room: DnpPublicRoom, elapsedMs: number) {
  return advanceDnpSimulation(room, elapsedMs);
}

export function shouldAcceptDnpResponse(currentCode: string, latestVersion: number, latestAppliedOrder: number, response: DnpPublicRoom, responseOrder: number) {
  return response.code === currentCode && (response.version > latestVersion || (response.version === latestVersion && responseOrder >= latestAppliedOrder));
}
