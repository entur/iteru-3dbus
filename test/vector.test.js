import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { faces } from '../src/vector.js';

/** Stand-in for the DOM vector.js builds into: elements that keep their tag, attributes and children. */
globalThis.document = {
  createElementNS: (_, tag) => ({ tag, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, append(...ks) { this.kids.push(...ks); } }),
};

const load = (n) => JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url), 'utf8'));
const volvo = load('volvo-8900'), citaro = load('citaro-g');
const hinted = (inp, ...hs) => ({ ...inp, sections: [{ ...inp.sections[0], doors_hint: hs }] });

/** The doors drawn on a side map: per door its frame and its panes. */
const drawn = (f) => f.svg.kids.filter((k) => k.attrs.class === 'door').map(({ kids: [frame, ...panes] }) => ({ frame: frame.attrs, panes: panes.map((p) => p.attrs) }));
const span = ({ frame }) => [frame.x, frame.x + frame.width];

test('the right side shows its doors mirrored, the left side none', () => {
  const { right, left } = faces(citaro);
  assert.deepEqual(right.map((f) => drawn(f).map(span)), [[[8982, 10232], [4325, 5575]], [[5600, 6850], [168, 1418]]]);
  assert.deepEqual(left.map((f) => drawn(f).length), [0, 0]);
});

test('a door has one pane per leaf inside its frame, glass or body colour', () => {
  const [solid, glazed] = drawn(faces(hinted(volvo, { zone: 'front_overhang', leaves: 1, glazed: false }, { zone: 'between_axles', leaves: 2 })).right[0]);
  assert.deepEqual(solid.panes.map((p) => p.fill), [volvo.base_color.hex]);
  assert.equal(glazed.panes.length, 2);
  assert.ok(glazed.panes.every((p) => p.fill !== volvo.base_color.hex && p.fill !== glazed.frame.fill));
  const [a, b] = glazed.panes, [x0, x1] = span(glazed);
  assert.ok(x0 < a.x && a.x + a.width < b.x && b.x + b.width < x1);
});

test('a door runs from its sill up to the band above doors and windows', () => {
  const ends = (inp) => (({ y, height }) => [y, y + height])(drawn(faces(inp).right[0])[0].frame);
  assert.deepEqual(ends(volvo), [250, 2940]);
  assert.deepEqual(ends(citaro), [250, 2490]);
  assert.deepEqual(ends({ ...volvo, band_above_mm: 330 }), [330, 2940]);
});

/** A map as plain data: tag, attributes and children of every element. */
const shape = (e) => (typeof e === 'string' ? e : [e.tag, e.attrs, e.kids.map(shape)]);

test('a side map has no wheel arches: it follows neither the axles nor the tyre', () => {
  const bare = { ...citaro, sections: citaro.sections.map(({ doors_hint, ...s }) => s) };
  const moved = { ...bare, tyre: { diameter_mm: 1100 }, sections: [{ ...bare.sections[0], axles_mm: [1500, 6000, 9000] }, { ...bare.sections[1], axles_mm: [3000] }] };
  const sides = ({ right, left }) => [...right, ...left].map((f) => shape(f.svg));
  assert.deepEqual(sides(faces(moved)), sides(faces(bare)));
  assert.deepEqual(faces(citaro).left.map((f) => f.svg.kids.map((k) => k.tag)), [['path'], ['path']]);
});

/** The windows drawn on a side map: per window its frame and the pane in it. */
const glazing = (f) => f.svg.kids.filter((k) => k.attrs.class === 'window').map(({ kids: [frame, pane] }) => ({ frame: frame?.attrs, pane: pane?.attrs }));
/** What each window of a side map takes up: its frame. */
const glass = (f) => glazing(f).map((w) => w.frame);
const across = ({ x, width }) => [x, x + width], down = ({ y, height }) => [y, y + height];

test('the right side shows its windows mirrored, the left side none', () => {
  const { right, left } = faces(citaro);
  assert.deepEqual(right.map((f) => glass(f).map(across)), [
    [[7318, 8902], [5655, 7238], [2950, 4245], [1575, 2870], [200, 1495]],
    [[4233, 5520], [2865, 4153], [1498, 2785]],
  ]);
  assert.deepEqual(left.map((f) => glass(f).length), [0, 0]);
});

test('a pane hangs from the band above, as high as the window band, on every section alike', () => {
  const both = (inp) => faces(inp).right.map((f) => [down(glass(f)[0]), down(drawn(f)[0].frame)]);
  assert.deepEqual(down(glass(faces(volvo).right[0])[0]), [250, 1650]);
  assert.deepEqual(both(citaro), [[[250, 1650], [250, 2490]], [[250, 1650], [250, 2490]]]);
  assert.deepEqual(both({ ...citaro, band_above_mm: 400, win_band_height_mm: 1000 }), [[[400, 1400], [400, 2490]], [[400, 1400], [400, 2490]]]);
  assert.deepEqual(down(glass(faces({ ...citaro, win_band_height_mm: 2500 }).right[0])[0]), [250, 2530]);
});

test('every right side has windows, their panes glass, none on a door', () =>
  [volvo, citaro].flatMap((inp) => faces(inp).right.map((f) => [inp, f])).forEach(([inp, f]) => {
    assert.ok(glazing(f).length > 0);
    glazing(f).forEach(({ frame, pane }) => {
      assert.ok(![inp.base_color.hex, frame.fill].includes(pane.fill));
      assert.ok(drawn(f).map(span).every(([d0, d1]) => across(frame)[1] < d0 || across(frame)[0] > d1));
    });
  }));

test('a window is framed like a door: the same colour, width and corners around its glass', () => {
  const f = faces(volvo).right[0], [{ frame: df, panes: [dp] }] = drawn(f), [{ frame: wf, pane: wp }] = glazing(f);
  const w = dp.x - df.x;
  assert.ok(w > 0);
  assert.deepEqual(f.svg.kids.find((k) => k.attrs.class === 'window').kids.map((k) => k.tag), ['rect', 'rect']);
  assert.deepEqual([wp.x - wf.x, wf.x + wf.width - wp.x - wp.width, wp.y - wf.y, wf.y + wf.height - wp.y - wp.height], [w, w, w, w]);
  assert.deepEqual([wf.fill, wf.rx, wp.fill, wp.rx], [df.fill, df.rx, dp.fill, dp.rx]);
});
