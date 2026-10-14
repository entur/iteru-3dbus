import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bgOf, flat, plane, ready, rgba } from '../src/scene.js';

const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-3, `${a} ≉ ${b}`));

test('rgba reads hex and rgb()/rgba() in comma and space syntax', () => {
  assert.deepEqual(rgba('#fff'), [1, 1, 1, 1]);
  near(rgba('#e4eaee'), [0xe4 / 255, 0xea / 255, 0xee / 255, 1]);
  near(rgba(' rgba(246, 248, 249, 0.92) '), [246 / 255, 248 / 255, 249 / 255, 0.92]);
  near(rgba('rgb(26 35 42 / 0.5)'), [26 / 255, 35 / 255, 42 / 255, 0.5]);
  assert.equal(rgba(''), null);
  assert.equal(rgba('oklch(0.5 0.1 200)'), null);
});

test('flat composites the top layer first, over white', () => {
  assert.deepEqual(flat([]), [1, 1, 1]);
  near(flat([[0, 0, 0, 0.5]]), [0.5, 0.5, 0.5]);
  near(flat([[1, 0, 0, 0.5], [0, 0, 1, 1]]), [0.5, 0, 0.5]);
  near(flat([[0, 0, 0, 0], [0, 1, 0, 1]]), [0, 1, 0]);
});

test('plane goes darker on a light background, lighter on a dark one', () => {
  const light = [0.96, 0.97, 0.97], dark = [0.1, 0.13, 0.15];
  plane(light).forEach((c, i) => assert.ok(c < light[i]));
  plane(dark).forEach((c, i) => assert.ok(c > dark[i]));
});

test('bgOf composites an element and its ancestors, skipping what has no colour', (t) => {
  globalThis.getComputedStyle = (e) => ({ backgroundColor: e.bg });
  t.after(() => delete globalThis.getComputedStyle);
  const body = { bg: 'rgb(0, 0, 0)', parentElement: null };
  const card = { bg: 'rgba(255, 255, 255, 0.5)', parentElement: body };
  const img = { bg: 'rgba(0, 0, 0, 0)', parentElement: card };
  assert.equal(bgOf(img), 'rgb(128 128 128)');
  assert.equal(bgOf({ bg: '', parentElement: { bg: 'oklch(0.5 0.1 200)', parentElement: null } }), 'rgb(255 255 255)');
  assert.equal(bgOf({ bg: 'rgba(0, 0, 0, 0)', parentElement: null }), 'rgb(255 255 255)');
});

test('ready waits for every texture image, and gives up after ms', async (t) => {
  globalThis.requestAnimationFrame = (f) => setTimeout(f, 1);
  t.after(() => delete globalThis.requestAnimationFrame);
  const tex = {}, root = { traverse: (f) => [{ material: [{ map: tex }, {}] }, {}].forEach(f) };
  let done = false;
  const p = ready(root).then(() => (done = true));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(done, false);
  tex.image = {};
  await p;
  const t0 = performance.now();
  await ready({ traverse: (f) => f({ material: { map: {} } }) }, 30);
  assert.ok(performance.now() - t0 >= 30);
});
