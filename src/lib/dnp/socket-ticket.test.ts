import test from 'node:test';
import assert from 'node:assert/strict';

import { issueDnpSocketTicket, verifyDnpSocketTicket } from './socket-ticket';

test('issues and verifies a short-lived room/player-bound ticket', () => {
  const ticket = issueDnpSocketTicket({ roomCode: 'ABC234', playerId: 'player-1' }, 'secret', { now: 1_000, nonce: 'nonce' });
  const claims = verifyDnpSocketTicket(ticket, 'secret', { now: 15_000 });
  assert.deepEqual(claims, { v: 1, roomCode: 'ABC234', playerId: 'player-1', exp: 31_000, nonce: 'nonce' });
  assert.equal(ticket.includes('player-token'), false);
});

test('rejects tampering, expiry, wrong secret, and expected-room mismatch', () => {
  const ticket = issueDnpSocketTicket({ roomCode: 'ABC234', playerId: 'p1' }, 'secret', { now: 1_000, nonce: 'n' });
  assert.equal(verifyDnpSocketTicket(`${ticket}x`, 'secret', { now: 2_000 }), null);
  assert.equal(verifyDnpSocketTicket(ticket, 'other', { now: 2_000 }), null);
  assert.equal(verifyDnpSocketTicket(ticket, 'secret', { now: 31_001 }), null);
  assert.equal(verifyDnpSocketTicket(ticket, 'secret', { now: 2_000, roomCode: 'ZZZ999' }), null);
});
