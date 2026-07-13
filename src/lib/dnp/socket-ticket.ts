import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const DNP_SOCKET_PROTOCOL_VERSION = 1;
export const DNP_SOCKET_TICKET_TTL_MS = 30_000;

export type DnpSocketTicketClaims = { v: 1; roomCode: string; playerId: string; exp: number; nonce: string };

type TicketOptions = { now?: number; nonce?: string };

function encode(value: string) { return Buffer.from(value).toString('base64url'); }
function sign(payload: string, secret: string) { return createHmac('sha256', secret).update(payload).digest('base64url'); }

export function issueDnpSocketTicket(identity: { roomCode: string; playerId: string }, secret: string, options: TicketOptions = {}) {
  if (!secret) throw new Error('DNP WebSocket ticket secret is not configured.');
  const claims: DnpSocketTicketClaims = {
    v: DNP_SOCKET_PROTOCOL_VERSION,
    roomCode: identity.roomCode,
    playerId: identity.playerId,
    exp: (options.now ?? Date.now()) + DNP_SOCKET_TICKET_TTL_MS,
    nonce: options.nonce ?? randomBytes(16).toString('base64url'),
  };
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyDnpSocketTicket(ticket: unknown, secret: string, options: { now?: number; roomCode?: string } = {}): DnpSocketTicketClaims | null {
  if (typeof ticket !== 'string' || !secret) return null;
  const parts = ticket.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<DnpSocketTicketClaims>;
    if (claims.v !== 1 || typeof claims.roomCode !== 'string' || typeof claims.playerId !== 'string' || typeof claims.exp !== 'number' || typeof claims.nonce !== 'string') return null;
    if (claims.exp < (options.now ?? Date.now()) || (options.roomCode && claims.roomCode !== options.roomCode)) return null;
    return claims as DnpSocketTicketClaims;
  } catch { return null; }
}
