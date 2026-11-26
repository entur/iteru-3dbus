import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromSpec, total, doors } from '../src/core.js';

const base = { width_mm: 2550, height_mm: 3200 };
const cases = {
  rigid: { ...base, length_mm: 12000, axles: 2, doors: [2, 2] },
  'three axles': { ...base, length_mm: 13200, axles: 3, doors: '2+2+2' },
  'no doors': { ...base, length_mm: 9000, axles: 2 },
  articulated: { ...base, length_mm: 18000, axles: 3, doors: [2, 2, 2], articulated: true, low_floor: true },
  'articulated, four axles': { ...base, length_mm: 18750, axles: 4, doors: [2, 2, 2, 2], articulated: true },
  'double-decker': { ...base, height_mm: 4300, length_mm: 10500, axles: 2, doors: [2, 1], decks: 'double' },
  short: { ...base, length_mm: 6000, axles: 2, doors: [1] },
};

for (const [name, spec] of Object.entries(cases))
  test(`fromSpec: ${name} gives a valid input`, () => {
    const r = fromSpec(spec);
    assert.ok(r.ok, r.errs?.join('; '));
    assert.equal(total(r.inp), spec.length_mm);
    assert.equal(r.inp.sections.length, spec.articulated ? 2 : 1);
    assert.equal(doors(r.inp).flat().length, [].concat(typeof spec.doors === 'string' ? spec.doors.split('+') : spec.doors ?? []).length);
  });

test('fromSpec: decks, floor and a realistic tyre end up in the input', () => {
  const dd = fromSpec(cases['double-decker']).inp;
  assert.ok(dd.upper_win_band_height_mm);
  assert.ok(!fromSpec(cases.rigid).inp.upper_win_band_height_mm);
  assert.ok(fromSpec(cases.articulated).inp.win_band_height_mm > fromSpec(cases.rigid).inp.win_band_height_mm);
  assert.equal(fromSpec(cases.rigid).inp.tyre.size, '295/80 R22.5');
  assert.equal(fromSpec(cases.short).inp.tyre.size, '235/75 R17.5');
  assert.equal(dd.tyre.size, '315/70 R22.5');
  assert.equal(fromSpec(cases.rigid).inp.tyre.rear_twin, true);
});

test('fromSpec: rejects what it cannot draw', () => {
  for (const bad of [
    { ...cases.rigid, axles: 1 },
    { ...cases.rigid, axles: 4 },
    { ...cases.rigid, axles: [{ tyre: '295/80 R22.5' }, { tyre: '295/80 R22.5' }] },
    { ...cases.rigid, axles: 2.5 },
    { ...cases.rigid, doors: [3] },
    { ...cases.articulated, decks: 'double' },
    { ...cases.rigid, length_mm: 'long' },
    { ...cases.rigid, length_mm: 3000 },
  ])
    assert.equal(fromSpec(bad).ok, false);
});
