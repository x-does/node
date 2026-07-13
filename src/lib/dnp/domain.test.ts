import test from 'node:test';
import assert from 'node:assert/strict';

import { allocateDnpSlots, generateDnpCode, getDnpSlotGeometry, hashDnpToken, normalizeDnpCode, normalizeDnpName, toDnpPublicRoom, verifyDnpToken, type DnpStoredPlayer, type DnpStoredRoom } from './domain';

const room: DnpStoredRoom = {
  id: 'room', code: 'ABC234', mode: 'private', status: 'lobby', adminPlayerId: 'p1', scoreLeft: 0, scoreRight: 0,
  ballX: 0.5, ballY: 0.5, ballVx: 0.1, ballVy: 0.2, version: 1, lastTickAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
};
const player = (id: string, tokenHash = 'hash'): DnpStoredPlayer => ({
  id, roomId: 'room', name: id, joinOrder: Number(id.slice(1)), slotIndex: Number(id.slice(1)) - 1, tokenHash,
  inputPosition: 0.5, inputSeq: 0, lastSeenAt: new Date(), leftAt: null, createdAt: new Date(0),
});

test('validates mandatory display names and six character unambiguous codes', () => {
  assert.equal(normalizeDnpName('  Ada   Lovelace  '), 'Ada Lovelace');
  assert.equal(normalizeDnpName(''), null);
  assert.equal(normalizeDnpName('12345678901234567'), null);
  assert.equal(normalizeDnpCode('abc234'), 'ABC234');
  assert.equal(normalizeDnpCode('ABC10O'), null);
});

test('generates deterministic six-character codes from supplied random bytes', () => {
  assert.equal(generateDnpCode(() => Uint8Array.from([0, 1, 2, 3, 4, 5])), 'ABCDEF');
});

test('allocates deterministic 1-12 slots alternating halves and splitting at 7+', () => {
  const slots = allocateDnpSlots(12);
  assert.deepEqual(slots.slice(0, 6).map((slot) => `${slot.half}:${slot.kind}:${slot.subIndex}`), [
    'left:side:0', 'right:side:0', 'left:top:0', 'right:top:0', 'left:bottom:0', 'right:bottom:0',
  ]);
  assert.deepEqual(slots.slice(6).map((slot) => `${slot.half}:${slot.kind}:${slot.subIndex}`), [
    'left:side:1', 'right:side:1', 'left:top:1', 'right:top:1', 'left:bottom:1', 'right:bottom:1',
  ]);
});

test('split slot geometry creates side and top/bottom paddle movement axes', () => {
  assert.equal(getDnpSlotGeometry(0).axis, 'y');
  assert.equal(getDnpSlotGeometry(2).axis, 'x');
  assert.ok(getDnpSlotGeometry(6).height < getDnpSlotGeometry(0).height);
});

test('public room DTO never exposes raw or hashed tokens', () => {
  const dto = toDnpPublicRoom(room, [player('p1', hashDnpToken('secret-token'))]);
  assert.equal(JSON.stringify(dto).includes('secret-token'), false);
  assert.equal(JSON.stringify(dto).includes(hashDnpToken('secret-token')), false);
  assert.equal(dto.players[0].isAdmin, true);
});

test('token verification accepts only matching raw tokens without direct hash comparison in callers', () => {
  const hash = hashDnpToken('secret-token');
  assert.equal(verifyDnpToken('secret-token', hash), true);
  assert.equal(verifyDnpToken('wrong-token', hash), false);
  assert.equal(verifyDnpToken(undefined, hash), false);
});
