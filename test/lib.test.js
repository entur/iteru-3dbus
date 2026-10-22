import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './raw.js';  // vector.js imports an .svg as text

const SRC = new URL('../src/', import.meta.url), GUIDE = new URL('../guide/bus-3d.js', import.meta.url);
const LIB = ['core.js', 'limits.js', 'vector.js', 'index.js'], APP = ['./main.js', './ui.js', './edit.js', /^@preact/, /guide\//];
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
  ['faces', 'mkBus', 'mapErrs', 'mkStage', 'mkStageShot', 'mkViews'].forEach((n) => assert.equal(typeof lib[n], 'function', n));
});

test('the guide element needs the package entry only', async () => {
  assert.deepEqual(specs(GUIDE), ['../src/index.js']);
  assert.equal(typeof (await import('../guide/bus-3d.js')).Bus3d, 'function');
});

test('the package is the lib build, and leaves to the host only what it depends on', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const { default: cfg } = await import('../vite.lib.config.js');
  const { entry } = cfg.build.lib, external = cfg.build.rollupOptions.external;
  assert.equal(pkg.name, '@entur/iteru-3dbus');
  assert.match(pkg.repository?.url ?? '', /github\.com\/entur\/iteru-3dbus/);
  assert.equal(pkg.scripts.prepack, 'npm run build:lib');
  Object.entries(pkg.exports).forEach(([k, v]) => {
    const n = k === '.' ? 'index' : k.slice(2);
    assert.ok(n in entry, `${k} has no lib entry`);
    assert.equal(v, `./dist-lib/${n}.js`);
  });
  const host = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
  ['three', 'ajv'].forEach((d) => assert.ok(external.some((re) => re.test(d)) && host.includes(d), `${d}: external and depended on`));
  assert.ok(pkg.peerDependencies?.three && !pkg.dependencies?.three, 'three is a peer');
});
