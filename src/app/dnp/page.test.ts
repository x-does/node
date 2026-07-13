import test from 'node:test';
import assert from 'node:assert/strict';

import { catalogueItems } from '../interactive-apps/catalogue';

test('interactive catalogue exposes DefinitelyNotPong as a live local /dnp app', () => {
  const item = catalogueItems.find((entry) => entry.href === '/dnp');

  assert.ok(item, 'expected a /dnp catalogue item');
  assert.equal(item.title, 'DefinitelyNotPong');
  assert.equal(item.status, 'live');
  assert.equal(item.external, undefined);
  assert.ok(item.tags.includes('game'));
  assert.match(item.description, /browser/i);
});

test('dnp route source is browser-only and does not declare a custom runtime', async () => {
  const page = await import('./page');
  const game = await import('./DnpGame');

  assert.equal(typeof page.default, 'function');
  assert.equal(typeof game.default, 'function');
  assert.equal('runtime' in page, false);
  assert.equal('dynamic' in page, false);
});
