import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mapErrs, mkBus } from '../src/bus.js';
import { bodyTop, endH, layout } from '../src/derive.js';
import { CLEARANCE } from '../src/dims.js';
import { load } from './examples.js';

const volvo = load('volvo-8900'), citaro = load('citaro-g');
const face = (w, h) => ({ w, h, svg: { cloneNode: () => ({}) } });
/** Stub face maps in the sizes faces() gives them, without a DOM. */
const maps = (inp, f = face) => {
  const h = bodyTop(inp) - CLEARANCE, sides = () => layout(inp).map((b) => f(b.len, h));
  return { right: sides(), left: sides(), front: [f(inp.width_mm, endH(inp))], rear: [f(inp.width_mm, endH(inp))] };
};
const patch = (m, side, f) => ({ ...m, [side]: m[side].map((x, i) => (i === 0 ? f(x) : x)) });

const bad = {
  'no maps': () => null,
  'a missing side': (m) => ({ ...m, left: undefined }),
  'one side map short': (m) => ({ ...m, right: m.right.slice(1) }),
  'a string for a face': (m) => patch(m, 'left', () => 'x'),
  'an empty object for a face': (m) => patch(m, 'front', () => ({})),
  'a face without an svg': (m) => patch(m, 'rear', (f) => ({ ...f, svg: undefined })),
  'a side map of another length': (m) => patch(m, 'right', (f) => ({ ...f, w: f.w + 1 })),
  'a side map of another height': (m) => patch(m, 'left', (f) => ({ ...f, h: f.h + 1 })),
  'an end map of another width': (m) => patch(m, 'front', (f) => ({ ...f, w: f.w + 1 })),
  'a front map of another height': (m) => patch(m, 'front', (f) => ({ ...f, h: f.h + 1 })),
  'a rear map of another height': (m) => patch(m, 'rear', (f) => ({ ...f, h: f.h - 1 })),
};

test('maps sized for the bus fit', () => [volvo, citaro].forEach((inp) => assert.deepEqual(mapErrs(inp, maps(inp)), [])));

test('maps of another bus do not fit', () => assert.equal(mapErrs(citaro, maps(volvo)).length, 1));

Object.entries(bad).forEach(([name, f]) => test(`rejects ${name}`, () => assert.equal(mapErrs(citaro, f(maps(citaro))).length, 1)));

/** Face maps whose clones note the width skin rasterises them at. */
const noted = (inp, ws) => maps(inp, (w, h) => ({ w, h, svg: { cloneNode: () => ({ setAttribute: (k, v) => k === 'width' && ws.push(v) }) } }));

/** Stands in the DOM three's texture loader needs; returns the images it makes, each with its load listener. */
const dom = (t) => {
  const imgs = [];
  globalThis.XMLSerializer = class { serializeToString() { return '<svg/>'; } };
  globalThis.document = { createElementNS: () => { const img = { addEventListener(k, f) { k === 'load' && (img.load = f); }, removeEventListener() {}, style: {} }; imgs.push(img); return img; } };
  t.after(() => (delete globalThis.XMLSerializer, delete globalThis.document));
  return imgs;
};

test('detail scales every face texture, 1 by default', (t) => {
  dom(t);
  const widths = (o) => {
    const ws = [];
    mkBus(citaro, noted(citaro, ws), o);
    return ws;
  };
  const full = widths(), half = widths({ detail: 0.5 });
  assert.deepEqual(full, widths({ detail: 1 }));
  assert.equal(half.length, full.length);
  half.forEach((w, i) => assert.ok(Math.abs(w - full[i] / 2) <= 1, `${w} is not half of ${full[i]}`));
});

test('a face shows the base colour until its map is in, then the map', (t) => {
  const imgs = dom(t), skins = [];
  mkBus(citaro, noted(citaro, [])).traverse((o) => skins.push(...[o.material ?? []].flat().filter((m) => m.userData.map)));
  assert.equal(skins.length, imgs.length);
  skins.forEach((m) => (assert.equal(m.map, null), assert.ok(m.color.equals(new THREE.Color(citaro.base_color.hex)))));
  imgs.forEach((img) => img.load.call(img));
  skins.forEach((m) => (assert.equal(m.map, m.userData.map), assert.ok(m.color.equals(new THREE.Color(0xffffff)))));
});
