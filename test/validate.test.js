import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../src/validate.js';
import { layout, spans, total, tyreDia } from '../src/derive.js';

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
  'missing tyre size and diameter': { ...volvo, tyre: { rear_twin: true } },
  'one door on a 12.4 m bus': sec(volvo, 0, { doors_hint: [{ zone: 'front_overhang', leaves: 2 }] }),
};

test('examples pass', () => {
  assert.deepEqual(validate(volvo), []);
  assert.deepEqual(validate(citaro), []);
});

Object.entries(bad).forEach(([name, inp]) =>
  test(`rejects ${name}`, () => assert.notEqual(validate(JSON.parse(JSON.stringify(inp))).length, 0)),
);

test('derives spans and layout', () => {
  assert.deepEqual(spans(volvo.sections[0]), { front: 2769, rear: 3297, wheelbases: [6330] });
  assert.equal(total(volvo), 12396);
  assert.equal(tyreDia(volvo.tyre), 1044);
  assert.equal(tyreDia(citaro.tyre), 950);
  assert.equal(total(citaro), 18200);
  assert.deepEqual(layout(citaro)[1], { x0: 11200, len: 7000, axles: [15900], bellows: 600 });
});
