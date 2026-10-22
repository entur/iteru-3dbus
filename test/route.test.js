import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST, href, parse } from '../src/route.js';

const ids = new Map([['volvo-8900', 'volvo-8900.xml'], ['bn-i-15-le', 'busnordic/bn-i-15-le.xml']]);
const at = (u, base = '/') => parse(new URL(u, 'http://h'), base, ids);
const BUS = (file) => ({ page: 'bus', file });

test('the two routes', () => {
  assert.deepEqual(at('/list'), LIST);
  assert.deepEqual(at('/bus?file=busnordic/bn-i-15-le.xml'), BUS('busnordic/bn-i-15-le.xml'));
  assert.deepEqual(at('/bus'), LIST);  // no file
  assert.deepEqual(at('/'), LIST);  // the start
  assert.deepEqual(at('/nope'), LIST);
});

test('under the Pages base', () => {
  assert.deepEqual(at('/iteru-3dbus/bus?file=volvo-8900.xml', '/iteru-3dbus/'), BUS('volvo-8900.xml'));
  assert.deepEqual(at('/iteru-3dbus/', '/iteru-3dbus/'), LIST);
  assert.deepEqual(at('/bus?file=volvo-8900.xml', '/iteru-3dbus/'), LIST);  // outside the base
});

test('old links', () => {
  assert.deepEqual(at('/?bus=volvo-8900'), BUS('volvo-8900.xml'));
  assert.deepEqual(at('/index.html?bus=bn-i-15-le'), BUS('busnordic/bn-i-15-le.xml'));
  assert.deepEqual(at('/?bus=nope'), LIST);
  assert.deepEqual(at('/#busnordic'), LIST);
});

test('href', () => {
  assert.equal(href(LIST, '/iteru-3dbus/'), '/iteru-3dbus/list');
  assert.equal(href(BUS('busnordic/bn-i-15-le.xml'), '/'), '/bus?file=busnordic/bn-i-15-le.xml');
  ['volvo-8900.xml', 'set/a b&c#d.xml'].forEach((f) => assert.deepEqual(at(href(BUS(f), '/x/'), '/x/'), BUS(f)));
});
