import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validate } from '../src/validate.js';
import { clashes, dash, doorWidth, doors, grill, hints, layout, lintel, sill, spans, total, tyreDia, windows, windowsLeft } from '../src/derive.js';

const BUSNORDIC = new URL('../examples/busnordic/', import.meta.url), BUSNORDIC_ROWS = 17;

const load = (n) => JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url), 'utf8'));
const volvo = load('volvo-8900'), citaro = load('citaro-g');
const sec = (inp, i, patch) => ({ ...inp, sections: inp.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

const bad = {
  'a brand': { ...volvo, brand: 'Volvo' },
  'a bus class': { ...volvo, bus_class: 'I' },
  'a schema version of 2.0': { ...volvo, schema_version: '2.0' },
  'leftover market field': { ...volvo, market: 'NO' },
  'first section with bellows': sec(volvo, 0, { bellows_ahead_mm: 600 }),
  'trailer without bellows': sec(citaro, 1, { bellows_ahead_mm: undefined }),
  'axles out of order': sec(volvo, 0, { axles_mm: [9099, 2769] }),
  'axle outside the section': sec(volvo, 0, { axles_mm: [2769, 12500] }),
  'axle gap 1 on a two-axle section': sec(volvo, 0, { doors_hint: [{ zone: 'between_axles', axle_gap: 1, leaves: 2 }, { zone: 'front_overhang', leaves: 2 }] }),
  'a door between the axles of a one-axle section': sec(citaro, 1, { doors_hint: [{ zone: 'between_axles', leaves: 2 }, { zone: 'rear_overhang', leaves: 2 }] }),
  'missing tyre size and diameter': { ...volvo, tyre: { rear_twin: true } },
  'a band of 1.2 m above the doors and windows': { ...volvo, band_above_mm: 1200 },
  'a window band 200 mm high': { ...volvo, win_band_height_mm: 200 },
  'a band of 1.5 m below the grille': { ...volvo, band_below_grill_mm: 1500 },
  'the band above as a percentage': { ...volvo, band_above_doors_and_windows_pct: 10 },
  'a window band hinted per section': sec(volvo, 0, { windows_hint: { band_mm: [1250, 2900] } }),
};

test('examples pass', () => {
  assert.deepEqual(validate(volvo), []);
  assert.deepEqual(validate(citaro), []);
});

test('the BusNordic set passes, one bus per row of the Bus Nordic tables', () => {
  const set = readdirSync(BUSNORDIC).map((f) => JSON.parse(readFileSync(new URL(f, BUSNORDIC), 'utf8')));
  assert.equal(set.length, BUSNORDIC_ROWS);
  set.forEach((inp) => assert.deepEqual(validate(inp), [], inp.front_display));
  assert.equal(new Set(set.map((inp) => inp.front_display)).size, set.length);
  assert.deepEqual([...new Set(set.map((inp) => hints(inp).length))].sort(), [1, 2, 3, 4, 5]);
});

Object.entries(bad).forEach(([name, inp]) =>
  test(`rejects ${name}`, () => assert.notEqual(validate(JSON.parse(JSON.stringify(inp))).length, 0)),
);

test('accepts a 19 m articulated bus and a 12.4 m bus with one door', () => {
  assert.deepEqual(validate(sec(citaro, 1, { length_mm: 8000 })), []);
  assert.deepEqual(validate(sec(volvo, 0, { doors_hint: [{ zone: 'front_overhang', leaves: 2 }] })), []);
});

test('accepts a band above the doors and windows and a window band height', () =>
  assert.deepEqual(validate({ ...volvo, band_above_mm: 300, win_band_height_mm: 1200 }), []));

test('accepts a windows hint, down to an empty one', () => {
  assert.deepEqual(validate(sec(volvo, 0, { windows_hint: { count: 5 } })), []);
  assert.deepEqual(validate(sec(citaro, 0, { windows_hint: {} })), []);
});

test('doors and windows end 250 mm below the body top, or as far as given', () => {
  assert.equal(lintel(volvo), 3050);
  assert.equal(lintel(citaro), 2600);
  assert.equal(lintel({ ...volvo, band_above_mm: 330 }), 2970);
});

test('the grille stands 35 mm above the lower edge of the flat front, or as far as given', () => {
  assert.equal(grill(volvo), 445);
  assert.equal(grill(citaro), 445);
  assert.equal(grill({ ...volvo, band_below_grill_mm: 500 }), 910);
  assert.deepEqual(validate({ ...volvo, band_below_grill_mm: 500 }), []);
});

test('the windshield ends 200 mm below the side windows, or as far above the front edge as given', () => {
  assert.equal(dash(volvo), 1450);
  assert.equal(dash(citaro), 1000);
  assert.equal(dash({ ...volvo, win_band_height_mm: 1000 }), 1850);
  assert.equal(dash({ ...citaro, win_band_height_mm: 2500 }), 410);
  assert.equal(dash({ ...volvo, band_below_windshield_mm: 900 }), 1310);
  assert.deepEqual(validate({ ...volvo, band_below_windshield_mm: 900 }), []);
  assert.notDeepEqual(validate({ ...volvo, band_below_windshield_mm: 2600 }), []);
});

test('the window band hangs from that line, 1400 mm high or as given, and stops at the skirt', () => {
  assert.equal(sill(volvo), 1650);
  assert.equal(sill(citaro), 1200);
  assert.equal(sill({ ...volvo, band_above_mm: 500, win_band_height_mm: 1000 }), 1800);
  assert.equal(sill({ ...citaro, win_band_height_mm: 2500 }), 320);
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

test('wheel arches do not interrupt the panes, however far down the band reaches', () => {
  const over = (ws) => volvo.sections[0].axles_mm.map((a) => ws.some((w) => w.x0 < a && a < w.x1));
  assert.deepEqual(over(windows(volvo)[0]), [true, true]);
  assert.deepEqual(windows({ ...volvo, win_band_height_mm: 2500 }), windows(volvo));
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

test('the left side has a pane for each pane and each door of the right side, in one run', () => {
  const count = (inp) => windowsLeft(inp).map((ws) => ws.length);
  assert.deepEqual(count(volvo), [9]);
  assert.deepEqual(count(citaro), [7, 5]);
  assert.deepEqual(windowsLeft(citaro)[1], [pane(200, 1456), pane(1536, 2792), pane(2872, 4128), pane(4208, 5464), pane(5544, 6800)]);
  assert.deepEqual(count(sec(volvo, 0, { windows_hint: { count: 3 } })), [5]);
  assert.deepEqual(count(sec(volvo, 0, { doors_hint: [{ ...fo, leaves: 1 }] })), [windows(sec(volvo, 0, { doors_hint: [{ ...fo, leaves: 1 }] }))[0].length + 1]);
});

test('a left side without doors across from it has the panes of the right side', () => {
  const bare = sec(volvo, 0, { doors_hint: undefined });
  assert.deepEqual(windowsLeft(bare), windows(bare));
});

test('the left side takes no more panes than stay 300 mm wide', () => {
  const short = sec(citaro, 1, { length_mm: 700, axles_mm: [350], doors_hint: [fo, ro] });
  assert.deepEqual(windowsLeft(short)[1], [pane(200, 500)]);
  assert.deepEqual(windowsLeft(sec(citaro, 1, { length_mm: 400, axles_mm: [200] }))[1], []);
});

const abs = sec(volvo, 0, { doors_hint: undefined, doors: [{ x_mm: 600, width_mm: 1250, leaves: 2 }, { x_mm: 6000, width_mm: 1250, leaves: 2 }] });
const absAt = (...xs) => sec(volvo, 0, { doors_hint: undefined, doors: xs.map((x_mm) => ({ x_mm, width_mm: 1250, leaves: 2 })) });

test('absolute doors are drawn where they are given', () => {
  assert.deepEqual(doors(abs)[0], [{ x0: 600, x1: 1850, leaves: 2, glazed: true }, { x0: 6000, x1: 7250, leaves: 2, glazed: true }]);
  assert.deepEqual(validate(abs), []);
});

test('a section takes doors or doors_hint, not both', () => {
  const errs = validate(sec(abs, 0, { doors_hint: [] }));
  assert.ok(errs.length > 0);
  assert.match(errs[0], /sections\/0/);
});

test('doors that only touch do not clash', () => {
  // volvo's arch radius is 632 mm (tyreDia 1044), so axles move out of the way of the touching doors
  assert.deepEqual(clashes(sec(absAt(600, 1850), 0, { axles_mm: [5000, 9099] })), []);
});

test('a door on a door, on an arch or past an end clashes', () => {
  assert.deepEqual(clashes(absAt(600, 800)), [{ section: 0, door: 1, other: 0 }]);
  assert.deepEqual(clashes(absAt(2000)), [{ section: 0, door: 0, axle: 0 }]);
  assert.ok(validate(absAt(-10)).length > 0);
  assert.deepEqual(clashes(absAt(11500)), [{ section: 0, door: 0, end: 'rear' }]);
});

test('rule (5) gives one message per clash, after rules (1) and (4)', () => {
  assert.deepEqual(validate(sec(absAt(600, 800), 0, {})), ['sections[0] door 2 lies on door 1']);
  assert.deepEqual(validate(absAt(2000)), ['sections[0] door 1 lies on axle 1']);
  assert.deepEqual(validate(absAt(11500)), ['sections[0] door 1 reaches past the rear end']);
  assert.deepEqual(validate(sec(absAt(600, 800), 0, { axles_mm: [9099, 2769] })), ['sections[0].axles_mm must ascend']);
});

test('hinted doors clash the same way', () => {
  const h = { zone: 'front_overhang', leaves: 2 };
  assert.deepEqual(clashes(sec(volvo, 0, { doors_hint: [h, h] })), [{ section: 0, door: 1, other: 0 }]);
});
