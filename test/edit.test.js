import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOOR, FIELDS, GROUPS, SECTION, addAxle, addDoor, axleLim, get, rmAxle, rmDoor, same, set, setBand, shifted, spec } from '../src/edit.js';
import { total } from '../src/derive.js';
import { validate } from '../src/validate.js';

const EDITABLE = ['brand', 'width_mm', 'height_mm', 'roof_equipment_mm', 'band_above_doors_and_windows_pct', 'tyre.size', 'tyre.diameter_mm', 'tyre.rear_twin', 'base_color.hex', 'front.badge_text'];
const SEC_EDITABLE = ['length_mm', 'bellows_ahead_mm', 'axles_mm', 'doors_hint', 'windows_hint.count', 'windows_hint.band_mm'];

const schema = JSON.parse(readFileSync(new URL('../schema/bus-input.schema.json', import.meta.url), 'utf8'));
const load = (n) => JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url), 'utf8'));
const volvo = load('volvo-8900'), citaro = load('citaro-g');
/** Paths of the values under a schema node: an object with properties is walked, anything else is one leaf. */
const leaves = (props, at = []) => Object.entries(props).flatMap(([k, s]) => (s.properties ? leaves(s.properties, [...at, k]) : [[...at, k].join('.')]));
const paths = (fs) => fs.filter((f) => f.path).map((f) => f.path.join('.'));

test('every schema value has a row', () => {
  const { sections, ...top } = schema.properties;
  assert.deepEqual(paths(FIELDS).sort(), leaves(top).sort());
  const { windows_hint: _, ...common } = schema.$defs.section_common.properties;
  assert.deepEqual(paths(SECTION).sort(), [...Object.keys(common), ...leaves({ windows_hint: schema.$defs.windows_hint }), 'bellows_ahead_mm'].sort());
  assert.deepEqual(paths(DOOR).sort(), Object.keys(schema.$defs.door_hint.properties).sort());
  assert.deepEqual([...new Set(FIELDS.map((f) => f.group))].filter((g) => !GROUPS.includes(g)), []);
});

test('the editable set is the drawn fields plus brand', () => {
  assert.deepEqual(paths(FIELDS.filter((f) => f.edit)), EDITABLE);
  assert.deepEqual(paths(SECTION.filter((f) => f.edit)), SEC_EDITABLE);
  assert.deepEqual(DOOR.filter((f) => !f.edit), []);
  assert.deepEqual(FIELDS.filter((f) => f.of && f.edit).map((f) => [f.label, f.to.join('.')]), [['Length', 'sections.0.length_mm']]);
});

test('an edit of the total length lands on the first section', () => {
  const len = FIELDS.find((f) => f.to);
  const out = set(citaro, len.to, shifted(citaro, len, 18000));
  assert.equal(total(out), 18000);
  assert.equal(out.sections[0].length_mm, citaro.sections[0].length_mm - 200);
  assert.deepEqual(out.sections.slice(1), citaro.sections.slice(1));
  assert.deepEqual(validate(out), []);
  assert.equal(shifted(volvo, len, total(volvo)), volvo.sections[0].length_mm);
  assert.equal(shifted(volvo, len, undefined), undefined);
});

test('set returns a new object and leaves the input alone', () => {
  const before = JSON.stringify(volvo), out = set(volvo, ['sections', 0, 'axles_mm', 1], 9000);
  assert.equal(get(out, ['sections', 0, 'axles_mm', 1]), 9000);
  assert.equal(JSON.stringify(volvo), before);
  assert.notEqual(out.sections, volvo.sections);
  assert.equal(out.tyre, volvo.tyre);
});

test('set removes a key on undefined, and an optional parent it empties', () => {
  assert.equal('roof_equipment_mm' in set(volvo, ['roof_equipment_mm'], undefined), false);
  const badged = set(citaro, ['front', 'badge_text'], 'MB');
  assert.deepEqual(badged.front, { badge_text: 'MB' });
  assert.equal('front' in set(badged, ['front', 'badge_text'], undefined), false);
  assert.deepEqual(set(volvo, ['front', 'badge_text'], undefined).front, { template: 'intercity' });
});

test('same ignores key order', () => {
  assert.ok(same(set(set(volvo, ['brand'], undefined), ['brand'], 'Volvo'), volvo));
  assert.ok(!same(set(volvo, ['width_mm'], 2500), volvo));
  assert.ok(!same(set(volvo, ['roof_equipment_mm'], undefined), volvo));
});

test('axles are added and removed inside the schema limits', () => {
  assert.deepEqual(axleLim(0), { min: 2, max: 3 });
  assert.deepEqual(axleLim(1), { min: 1, max: 2 });
  const more = addAxle(volvo, 0), trail = addAxle(citaro, 1);
  assert.deepEqual(more.sections[0].axles_mm, [2769, 9099, 10748]);
  assert.deepEqual(validate(more), []);
  assert.deepEqual(trail.sections[1].axles_mm, [4700, 5850]);
  assert.deepEqual(validate(trail), []);
  assert.deepEqual(rmAxle(more, 0), volvo);
  assert.deepEqual(rmAxle(trail, 1), citaro);
});

test('spec reads limits and defaults from the schema', () => {
  assert.equal(spec(['width_mm']).maximum, 2550);
  assert.equal(spec(['tyre', 'rear_twin']).default, true);
  assert.equal(spec(['sections', 0, 'length_mm']).minimum, 2000);
  assert.equal(spec(['sections', 1, 'bellows_ahead_mm']).maximum, 1200);
  assert.equal(spec(['sections', 0, 'axles_mm', 1]).minimum, 0);
  assert.equal(spec(['sections', 0, 'doors_hint']).maxItems, 4);
  assert.deepEqual(spec(['sections', 0, 'doors_hint', 1, 'zone']).enum, ['front_overhang', 'between_axles', 'rear_overhang']);
  assert.equal(spec(['sections', 1, 'doors_hint', 0, 'width_mm']).maximum, 1600);
  assert.equal(spec(['sections', 1, 'doors_hint', 0, 'glazed']).default, true);
  assert.equal(spec(['sections', 0, 'windows_hint', 'count']).maximum, 20);
  assert.equal(spec(['sections', 1, 'windows_hint', 'band_mm', 0]).minimum, 300);
  assert.equal(spec(['sections', 1, 'windows_hint', 'band_mm', 1]).maximum, 4400);
});

test('a door is added with two leaves, in the zone that holds the fewest', () => {
  const last = (inp, i) => inp.sections[i].doors_hint.at(-1), bare = set(volvo, ['sections', 0, 'doors_hint'], undefined);
  assert.deepEqual(last(addDoor(volvo, 0), 0), { zone: 'rear_overhang', leaves: 2 });
  assert.deepEqual(addDoor(bare, 0).sections[0].doors_hint, [{ zone: 'front_overhang', leaves: 2 }]);
  assert.deepEqual(last(addDoor(addDoor(volvo, 0), 0), 0), { zone: 'front_overhang', leaves: 2 });
  assert.deepEqual(validate(addDoor(volvo, 0)), []);
});

test('a door is never added between the axles of a one-axle section', () => {
  const full = [0, 1, 2].reduce((inp) => addDoor(inp, 1), set(citaro, ['sections', 1, 'doors_hint'], undefined));
  assert.deepEqual(full.sections[1].doors_hint.map((d) => d.zone), ['front_overhang', 'rear_overhang', 'front_overhang']);
  assert.deepEqual(validate(full), []);
});

test('a door is removed by its index, and the list with its last door', () => {
  assert.deepEqual(rmDoor(volvo, 0, 0).sections[0].doors_hint, [volvo.sections[0].doors_hint[1]]);
  assert.deepEqual(rmDoor(addDoor(volvo, 0), 0, 2), volvo);
  assert.equal('doors_hint' in rmDoor(rmDoor(volvo, 0, 0), 0, 0).sections[0], false);
  assert.equal(volvo.sections[0].doors_hint.length, 2);
});

const WIN = ['sections', 0, 'windows_hint'];

test('the windows rows hint at what is drawn while nothing is hinted', () => {
  const [count, ends] = SECTION.filter((f) => f.path?.[0] === 'windows_hint');
  assert.deepEqual([count.hint(volvo, 0), count.hint(citaro, 0), count.hint(citaro, 1)], [7, 5, 3]);
  assert.deepEqual(ends.hint(citaro, 1), [1250, 2622]);
});

test('one end of the window band is written, the other keeps its value or takes the default', () => {
  const lo = setBand(volvo, 0, 0, 1400);
  assert.deepEqual(get(lo, WIN), { band_mm: [1400, 3036] });
  assert.deepEqual(get(setBand(lo, 0, 1, 2900), WIN), { band_mm: [1400, 2900] });
  assert.deepEqual(setBand(citaro, 1, 1, 2500).sections[1].windows_hint, { band_mm: [1250, 2500] });
  assert.deepEqual(validate(setBand(lo, 0, 1, 2900)), []);
  assert.equal('windows_hint' in volvo.sections[0], false);
});

test('emptying an end of the window band drops it, and windows_hint with its last value', () => {
  const lo = setBand(volvo, 0, 0, 1400), counted = set(lo, [...WIN, 'count'], 5);
  assert.ok(same(setBand(lo, 0, 1, undefined), volvo));
  assert.deepEqual(get(setBand(counted, 0, 0, undefined), WIN), { count: 5 });
  assert.ok(same(set(setBand(counted, 0, 0, undefined), [...WIN, 'count'], undefined), volvo));
});
