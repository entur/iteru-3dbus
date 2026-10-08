import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../src/validate.js';
import { band, doorWidth, doors, layout, lintel, spans, total, tyreDia, windows } from '../src/derive.js';

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
  'an empty door list on a 12.4 m bus': sec(volvo, 0, { doors_hint: [] }),
  'a window band upside down': sec(volvo, 0, { windows_hint: { band_mm: [2000, 1500] } }),
  'a window band above the body': sec(citaro, 0, { windows_hint: { band_mm: [1250, 2900] } }),
};

test('examples pass', () => {
  assert.deepEqual(validate(volvo), []);
  assert.deepEqual(validate(citaro), []);
});

Object.entries(bad).forEach(([name, inp]) =>
  test(`rejects ${name}`, () => assert.notEqual(validate(JSON.parse(JSON.stringify(inp))).length, 0)),
);

test('accepts a band above the doors and windows', () => assert.deepEqual(validate({ ...volvo, band_above_doors_and_windows_pct: 10 }), []));

test('accepts a windows hint, down to an empty one and up to a band that ends on the body top', () => {
  assert.deepEqual(validate(sec(volvo, 0, { windows_hint: { count: 5, band_mm: [1300, 2900] } })), []);
  assert.deepEqual(validate(sec(citaro, 1, { windows_hint: { band_mm: [1250, 2850] } })), []);
  assert.deepEqual(validate(sec(citaro, 0, { windows_hint: {} })), []);
});

test('names the section whose window band is wrong, and how', () => {
  assert.deepEqual(validate(sec(volvo, 0, { windows_hint: { band_mm: [2000, 1500] } })), ['sections[0].windows_hint.band_mm must ascend']);
  assert.deepEqual(validate(sec(citaro, 1, { windows_hint: { band_mm: [1250, 2900] } })), ['sections[1].windows_hint.band_mm must end at or below the body top, 2850 mm']);
});

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

test('a door is as wide as given, else as its leaves imply', () =>
  assert.deepEqual([{ leaves: 1 }, { leaves: 2 }, { leaves: 2, width_mm: 1400 }].map(doorWidth), [900, 1250, 1400]));

const pane = (x0, x1) => ({ x0, x1 });
const glazed = (inp, i, hint) => windows(sec(inp, i, { windows_hint: hint }))[i];
const fo = { zone: 'front_overhang', leaves: 2 }, ba = { zone: 'between_axles', leaves: 2 }, ro = { zone: 'rear_overhang', leaves: 2 };

test('the window band runs from the default sill to the lintel, or as hinted for its section', () => {
  const hinted = sec(citaro, 1, { windows_hint: { band_mm: [1400, 2500] } });
  assert.deepEqual(band(volvo, 0), [1250, 3036]);
  assert.deepEqual(band(citaro, 1), [1250, 2622]);
  assert.deepEqual([band(hinted, 0), band(hinted, 1)], [[1250, 2622], [1400, 2500]]);
  assert.deepEqual(band(sec(volvo, 0, { windows_hint: { count: 5 } }), 0), [1250, 3036]);
});

test('glazes the examples with equal panes between the doors', () => {
  assert.deepEqual(windows(volvo), [
    [pane(1715, 2944), pane(3024, 4253), pane(4333, 5561), pane(5641, 6870), pane(8280, 9532), pane(9612, 10864), pane(10944, 12196)],
  ]);
  assert.deepEqual(windows(citaro), [
    [pane(1698, 3282), pane(3362, 4945), pane(6355, 7650), pane(7730, 9025), pane(9105, 10400)],
    [pane(1480, 2767), pane(2847, 4135), pane(4215, 5502)],
  ]);
});

test('panes stay 200 mm off the body ends and 80 mm off each other and the doors', () =>
  [volvo, citaro].forEach((inp) =>
    windows(inp).forEach((ws, i) =>
      ws.forEach((w, k) => {
        assert.ok(w.x0 >= 200 && w.x1 <= inp.sections[i].length_mm - 200);
        assert.ok(k === 0 || w.x0 - ws[k - 1].x1 >= 80);
        assert.ok(doors(inp)[i].every((d) => w.x1 <= d.x0 - 80 || w.x0 >= d.x1 + 80));
      }),
    ),
  ));

test('wheel arches do not interrupt the panes, however low the band reaches', () => {
  const over = (ws) => volvo.sections[0].axles_mm.map((a) => ws.some((w) => w.x0 < a && a < w.x1));
  assert.deepEqual(over(windows(volvo)[0]), [true, true]);
  assert.deepEqual(glazed(volvo, 0, { band_mm: [900, 2900] }), windows(volvo)[0]);
  assert.deepEqual(glazed(volvo, 0, { band_mm: [400, 2900] }), windows(volvo)[0]);
});

test('a section without doors is glazed from end to end', () => {
  const ws = windows(sec(volvo, 0, { doors_hint: undefined }))[0];
  assert.equal(ws.length, 8);
  assert.deepEqual([ws[0].x0, ws.at(-1).x1], [200, 12196]);
});

test('windows_hint.count fixes the number of panes, the longest run first', () => {
  assert.deepEqual(glazed(volvo, 0, { count: 1 }), [pane(1715, 6870)]);
  assert.deepEqual(glazed(volvo, 0, { count: 3 }), [pane(1715, 4253), pane(4333, 6870), pane(8280, 12196)]);
  assert.deepEqual(glazed(volvo, 0, { count: 7 }), windows(volvo)[0]);
  assert.equal(glazed(volvo, 0, { count: 9 }).length, 9);
});

test('a count the section has no room for stops at panes 300 mm wide', () => {
  const ws = glazed(citaro, 1, { count: 20 });
  assert.equal(ws.length, 10);
  assert.ok(ws.every((w) => w.x1 - w.x0 >= 300));
});

test('an empty windows hint draws the default panes', () => assert.deepEqual(glazed(volvo, 0, {}), windows(volvo)[0]));

test('doors that fill a section, lie on each other or stick out leave no pane on them', () => {
  const full = sec(citaro, 1, { length_mm: 2600, axles_mm: [1300], doors_hint: [{ ...fo, width_mm: 1600 }, { ...ro, width_mm: 1600 }], windows_hint: { count: 4 } });
  assert.deepEqual(windows(full)[1], []);
  assert.deepEqual(windows(sec(volvo, 0, { doors_hint: [fo, fo, ba] })), windows(sec(volvo, 0, { doors_hint: [fo, ba] })));
  assert.deepEqual(windows(sec(citaro, 1, { doors_hint: [{ ...ro, width_mm: 1600 }, fo] }))[1], [pane(200, 1288), pane(2698, 3973), pane(4053, 5327)]);
});
