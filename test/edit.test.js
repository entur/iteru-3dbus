import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOOR, FIELDS, GROUPS, SECTION, addAxle, addDoor, axleLim, get, rmAxle, rmDoor, same, set, shifted, signed, spec, toJson, typed } from '../src/edit.js';
import { total } from '../src/derive.js';
import { validate } from '../src/validate.js';

const EDITABLE = ['brand', 'width_mm', 'height_mm', 'roof_equipment_mm', 'band_above_mm', 'win_band_height_mm', 'band_below_grill_mm', 'band_below_windshield_mm', 'tyre.size', 'tyre.diameter_mm', 'tyre.rear_twin', 'base_color.hex', 'front.badge_text', 'front_display'];
const SEC_EDITABLE = ['length_mm', 'bellows_ahead_mm', 'axles_mm', 'doors_hint', 'windows_hint.count'];

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
  assert.deepEqual([spec(['band_above_mm']).default, spec(['win_band_height_mm']).default, spec(['band_below_grill_mm']).default], [250, 1400, 35]);
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

test('the windows row hints at the panes drawn while no count is given', () => {
  const [count] = SECTION.filter((f) => f.path?.[0] === 'windows_hint');
  assert.deepEqual([count.hint(volvo, 0), count.hint(citaro, 0), count.hint(citaro, 1)], [7, 5, 3]);
});

test('the bands are rows of Dimensions, their schema defaults as hints', () => {
  const rows = FIELDS.filter((f) => ['band_above_mm', 'win_band_height_mm', 'band_below_grill_mm', 'band_below_windshield_mm'].includes(f.path?.[0]));
  assert.deepEqual(rows.map((f) => [f.group, f.hint(volvo)]), [['Dimensions', 250], ['Dimensions', 1400], ['Dimensions', 35], ['Dimensions', 1040]]);
  assert.equal(rows.at(-1).hint({ ...volvo, band_below_windshield_mm: 300, win_band_height_mm: 1000 }), 1440);
});

test('emptying the window count takes windows_hint with it', () => {
  const counted = set(volvo, [...WIN, 'count'], 5);
  assert.deepEqual(get(counted, WIN), { count: 5 });
  assert.ok(same(set(counted, [...WIN, 'count'], undefined), volvo));
});

test('the app shows the model on the front display of a bus that names no text for it', () => {
  assert.equal(signed(volvo).front_display, volvo.model);
  assert.equal('front_display' in volvo, false);
  const off = { ...volvo, front_display: '' }, own = { ...volvo, front_display: '21 Tjuvholmen' };
  assert.equal(signed(off), off);
  assert.equal(signed(own), own);
});

test('a bus input as a JSON file: the same input back, keys in their order, a newline at the end', () => {
  const edited = set(volvo, ['front_display'], '21');
  assert.deepEqual(JSON.parse(toJson(edited)), edited);
  assert.equal(toJson(volvo), readFileSync(new URL('../examples/volvo-8900.json', import.meta.url), 'utf8'));
  assert.ok(toJson(edited).trimEnd().endsWith('"front_display": "21"\n}'));
});

test('an emptied control takes its value out, but the display keeps an empty text, which turns it off', () => {
  const row = (p) => FIELDS.find((f) => f.path?.join('.') === p);
  assert.equal(typed(row('front.badge_text'), ''), undefined);
  assert.equal(typed(row('front_display'), ''), '');
  assert.equal(typed(row('front_display'), '21'), '21');
  assert.equal(typed(row('height_mm'), '3300'), 3300);
  assert.equal(typed(row('height_mm'), ''), undefined);
  const off = set(volvo, ['front_display'], typed(row('front_display'), ''));
  assert.deepEqual([validate(off), signed(off).front_display], [[], '']);
});
