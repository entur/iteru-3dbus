import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../src/validate.js';
import { doors, layout, lintel, spans, total, tyreDia } from '../src/derive.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url), 'utf8'));
const volvo = load('volvo-8900'), citaro = load('citaro-g');
const sec = (inp, i, patch) => ({ ...inp, sections: inp.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

const bad = {
  'rigid with two sections': { ...citaro, body: 'rigid' },
  'articulated with one section': { ...volvo, body: 'articulated' },
  'articulated class III': { ...citaro, bus_class: 'III' },
  '12.4 m class A': { ...volvo, bus_class: 'A' },
  '3.3 m double-decker': { ...volvo, floor_type: 'low_floor_lower_level' },
  'leftover market field': { ...volvo, market: 'NO' },
  'first section with bellows': sec(volvo, 0, { bellows_ahead_mm: 600 }),
  'trailer without bellows': sec(citaro, 1, { bellows_ahead_mm: undefined }),
  'axles out of order': sec(volvo, 0, { axles_mm: [9099, 2769] }),
  'axle outside the section': sec(volvo, 0, { axles_mm: [2769, 12500] }),
  'over 18.75 m': sec(citaro, 1, { length_mm: 8000 }),
  'axle gap 1 on a two-axle section': sec(volvo, 0, { doors_hint: [{ zone: 'between_axles', axle_gap: 1, leaves: 2 }, { zone: 'front_overhang', leaves: 2 }] }),
  'a door between the axles of a one-axle section': sec(citaro, 1, { doors_hint: [{ zone: 'between_axles', leaves: 2 }, { zone: 'rear_overhang', leaves: 2 }] }),
  'missing tyre size and diameter': { ...volvo, tyre: { rear_twin: true } },
  'a 40 % band above the doors and windows': { ...volvo, band_above_doors_and_windows_pct: 40 },
  'one door on a 12.4 m bus': sec(volvo, 0, { doors_hint: [{ zone: 'front_overhang', leaves: 2 }] }),
};

test('examples pass', () => {
  assert.deepEqual(validate(volvo), []);
  assert.deepEqual(validate(citaro), []);
});

Object.entries(bad).forEach(([name, inp]) =>
  test(`rejects ${name}`, () => assert.notEqual(validate(JSON.parse(JSON.stringify(inp))).length, 0)),
);

test('accepts a band above the doors and windows', () => assert.deepEqual(validate({ ...volvo, band_above_doors_and_windows_pct: 10 }), []));

test('doors and windows end 8 % of the body height below its top, or the share given', () => {
  assert.equal(lintel(volvo), 3036);
  assert.equal(lintel(citaro), 2622);
  assert.equal(lintel({ ...volvo, band_above_doors_and_windows_pct: 10 }), 2970);
});

test('derives spans and layout', () => {
  assert.deepEqual(spans(volvo.sections[0]), { front: 2769, rear: 3297, wheelbases: [6330] });
  assert.equal(total(volvo), 12396);
  assert.equal(tyreDia(volvo.tyre), 1044);
  assert.equal(tyreDia(citaro.tyre), 950);
  assert.equal(total(citaro), 18200);
  assert.deepEqual(layout(citaro)[1], { x0: 11200, len: 7000, axles: [15900], local: [4700], bellows: 600 });
});

const door = (x0, x1, leaves = 2, glazed = true) => ({ x0, x1, leaves, glazed });
const hinted = (inp, i, ...hs) => doors(sec(inp, i, { doors_hint: hs }))[i];

test('places the hinted doors of the examples', () => {
  assert.deepEqual(doors(volvo), [[door(385, 1635), door(6950, 8200)]]);
  assert.deepEqual(doors(citaro), [
    [door(368, 1618), door(5025, 6275)],
    [door(150, 1400), door(5582, 6832)],
  ]);
});

test('a single-leaf door is 900 mm wide', () =>
  assert.deepEqual(hinted(volvo, 0, { zone: 'front_overhang', bias: 'front', leaves: 1 }), [door(150, 1050, 1)]));

test('width_mm overrides the width the leaves imply', () =>
  assert.deepEqual(hinted(volvo, 0, { zone: 'between_axles', bias: 'rear', leaves: 2, width_mm: 1400 }), [door(6800, 8200)]));

test('an unglazed door stays unglazed', () =>
  assert.deepEqual(hinted(volvo, 0, { zone: 'front_overhang', bias: 'front', leaves: 2, glazed: false }), [door(150, 1400, 2, false)]));

test('axle_gap picks the gap between three axles', () => {
  const gap = (g) => ({ zone: 'between_axles', axle_gap: g, leaves: 2 });
  assert.deepEqual(doors(sec(volvo, 0, { axles_mm: [2000, 6000, 10000], doors_hint: [gap(0), gap(1)] }))[0], [door(3375, 4625), door(7375, 8625)]);
});

test('a door wider than its zone is centred on it, whatever the bias', () =>
  assert.deepEqual(hinted(citaro, 1, { zone: 'rear_overhang', bias: 'rear', leaves: 2, width_mm: 1400 }), [door(5507, 6907)]));
