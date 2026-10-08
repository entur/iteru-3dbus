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
  assert.deepEqual(ends(volvo), [264, 2940]);
  assert.deepEqual(ends(citaro), [228, 2490]);
  assert.deepEqual(ends({ ...volvo, band_above_doors_and_windows_pct: 10 }), [330, 2940]);
});
