import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './raw.js';  // the elements import an .svg as text

const SRC = new URL('../src/', import.meta.url);
const LIB = ['core.js', 'bus-2d.js', 'bus-3d.js', 'index.js'], APP = ['./main.js', './ui.js', './edit.js', /^@preact/];
const D3 = ['./bus.js', './scene.js', './views.js', './bus-3d.js'], D2 = ['./vector.js', './bus-2d.js'];
const IMPORT = /(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

const specs = (f) => [...readFileSync(new URL(f, SRC), 'utf8').matchAll(IMPORT)].map((m) => m[1] ?? m[2]);
/** Every import specifier a src file reaches, following its local ./*.js imports. */
const reach = (f, seen = new Set()) =>
  specs(f).reduce((acc, s) => (acc.has(s) ? acc : (acc.add(s), /^\.\/.*\.js$/.test(s) ? reach(s.slice(2), acc) : acc)), seen);
const hits = (f, banned) => [...reach(f)].filter((s) => banned.some((b) => (b instanceof RegExp ? b.test(s) : b === s)));

test('the library never reaches the app', () => LIB.forEach((f) => assert.deepEqual(hits(f, APP), [], f)));

test('bus-3d reaches no 2D file', () => assert.deepEqual(hits('bus-3d.js', D2), []));

test('bus-2d reaches neither three nor a 3D file', () => assert.deepEqual(hits('bus-2d.js', [/^three/, ...D3]), []));

test('core reaches no DOM or three file', () => assert.deepEqual(hits('core.js', [/^three/, './elem.js', ...D2, ...D3]), []));

test('core loads without a DOM', async () => {
  const core = await import('../src/core.js');
  assert.equal(typeof core.validate, 'function');
  assert.equal(typeof core.layout, 'function');
  assert.equal(core.schema.type, 'object');
});

test('the elements load without a DOM', async () => {
  const lib = await import('../src/index.js');
  assert.deepEqual(Object.keys(lib.FACES), ['right', 'left', 'front', 'rear']);
  assert.deepEqual(Object.keys(lib.VIEWS), ['quarter', 'left', 'right', 'front', 'rear', 'top']);
  assert.equal(typeof lib.Bus2d, 'function');
  assert.equal(typeof lib.Bus3d, 'function');
});
