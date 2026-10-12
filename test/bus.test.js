import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapErrs } from '../src/bus.js';
import { bodyTop, endH, layout } from '../src/derive.js';
import { CLEARANCE } from '../src/dims.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url), 'utf8'));
const volvo = load('volvo-8900'), citaro = load('citaro-g');
const face = (w, h) => ({ w, h, svg: { cloneNode: () => ({}) } });
/** Stub face maps in the sizes faces() gives them, without a DOM. */
const maps = (inp) => {
  const h = bodyTop(inp) - CLEARANCE, sides = () => layout(inp).map((b) => face(b.len, h));
  return { right: sides(), left: sides(), front: [face(inp.width_mm, endH(inp))], rear: [face(inp.width_mm, endH(inp))] };
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
