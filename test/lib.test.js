import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './raw.js';  // vector.js imports an .svg as text

const SRC = new URL('../src/', import.meta.url), GUIDE = new URL('../guide/bus-3d.js', import.meta.url);
const LIB = ['core.js', 'vector.js', 'index.js'], APP = ['./main.js', './ui.js', './edit.js', /^@preact/, /guide\//];
const D3 = ['./bus.js', './scene.js', './views.js'], D2 = ['./vector.js'];
const IMPORT = /(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

const specs = (url) => [...readFileSync(url, 'utf8').matchAll(IMPORT)].map((m) => m[1] ?? m[2]);
/** Every import specifier a src file reaches, following its local ./*.js imports. */
const reach = (f, seen = new Set()) =>
  specs(new URL(f, SRC)).reduce((acc, s) => (acc.has(s) ? acc : (acc.add(s), /^\.\/.*\.js$/.test(s) ? reach(s.slice(2), acc) : acc)), seen);
const hits = (f, banned) => [...reach(f)].filter((s) => banned.some((b) => (b instanceof RegExp ? b.test(s) : b === s)));

test('the library never reaches the app', () => LIB.forEach((f) => assert.deepEqual(hits(f, APP), [], f)));

test('the 3D files reach no 2D file', () => D3.forEach((f) => assert.deepEqual(hits(f.slice(2), D2), [], f)));

test('the face maps reach neither three nor a 3D file', () => assert.deepEqual(hits('vector.js', [/^three/, ...D3]), []));

test('core reaches no three, 2D or 3D file', () => assert.deepEqual(hits('core.js', [/^three/, ...D2, ...D3]), []));

test('core loads without a DOM', async () => {
  const core = await import('../src/core.js');
  assert.equal(typeof core.validate, 'function');
  assert.equal(typeof core.layout, 'function');
  assert.equal(core.schema.type, 'object');
});

test('the library loads without a DOM', async () => {
  const lib = await import('../src/index.js');
  assert.deepEqual(Object.keys(lib.VIEWS), ['quarter', 'left', 'right', 'front', 'rear', 'top']);
  ['faces', 'mkBus', 'mapErrs', 'mkStage', 'mkViews'].forEach((n) => assert.equal(typeof lib[n], 'function', n));
});

test('the guide element needs the package entry only', async () => {
  assert.deepEqual(specs(GUIDE), ['../src/index.js']);
  assert.equal(typeof (await import('../guide/bus-3d.js')).Bus3d, 'function');
});
