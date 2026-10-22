import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './raw.js';

const { faces } = await import('../src/vector.js');  // after raw.js: vector.js imports an .svg as text

const VIEWBOX = /viewBox="([^"]+)"/;

/** Stand-in for the DOM vector.js builds into: elements that keep their tag, attributes and children. */
const node = (tag, attrs = {}, kids = []) => ({
  tag, attrs, kids,
  setAttribute(k, v) { this.attrs[k] = v; },
  append(...ks) { this.kids.push(...ks); },
  cloneNode() { return node(tag, { ...this.attrs }, this.kids.map((k) => (typeof k === 'string' ? k : k.cloneNode()))); },
});
globalThis.document = { createElementNS: (_, tag) => node(tag) };
/** Stand-in parser: the root element of the markup with its viewBox, which is what a map needs of a drawing. */
globalThis.DOMParser = class {
  parseFromString(s) { return { documentElement: node('svg', { viewBox: VIEWBOX.exec(s)[1] }) }; }
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
  assert.deepEqual(faces(citaro).left.map((f) => f.svg.kids.filter((k) => k.attrs.class !== 'window').map((k) => k.tag)), [['path'], ['path']]);
});

/** The windows drawn on a side map: per window its frame and the pane in it. */
const glazing = (f, cls = 'window') => f.svg.kids.filter((k) => k.attrs.class === cls).map(({ kids: [frame, pane] }) => ({ frame: frame?.attrs, pane: pane?.attrs }));
/** What each window of a side map takes up: its frame. */
const glass = (f) => glazing(f).map((w) => w.frame);
const across = ({ x, width }) => [x, x + width], down = ({ y, height }) => [y, y + height];

test('the right side shows its windows mirrored, the left side a pane for each of them and each door', () => {
  const { right, left } = faces(citaro);
  assert.deepEqual(right.map((f) => glass(f).map(across)), [
    [[7318, 8902], [5655, 7238], [2950, 4245], [1575, 2870], [200, 1495]],
    [[4233, 5520], [2865, 4153], [1498, 2785]],
  ]);
  assert.deepEqual(left.map((f) => glass(f).length), [7, 5]);
  assert.deepEqual(left.map((f) => across(glass(f)[0])), [[200, 1589], [200, 1456]]);
  assert.deepEqual(left.map((f) => down(glass(f)[0])), right.map((f) => down(glass(f)[0])));
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

/** The parts of a map drawn under one class name. */
const part = (f, cls) => f.svg.kids.filter((k) => k.attrs.class === cls);

test('the front has a windscreen from the band above down to above the badge, centred', () => {
  const screen = (inp) => (([f]) => ({ f, ...glazing(f, 'windscreen')[0], badge: part(f, 'badge')[0].attrs }))(faces(inp).front);
  const { f, frame, pane, badge } = screen(volvo), [side] = glazing(faces(volvo).right[0]);
  assert.equal(frame.y, 160);
  assert.equal(screen({ ...volvo, band_above_mm: 330 }).frame.y, 240);
  assert.equal(screen(citaro).frame.y, 160);
  assert.ok(down(frame)[1] < badge.y);
  assert.equal(across(frame)[0] + across(frame)[1], f.w);
  assert.deepEqual([frame.fill, pane.fill], [side.frame.fill, side.pane.fill]);
  assert.deepEqual(faces(volvo).rear[0].svg.kids.map((k) => k.tag), ['rect']);
});

test('the badge stands on the band below the grille, the windscreen making way and then going', () => {
  const at = (inp) => (([f]) => ({ h: f.h, badge: down(part(f, 'badge')[0].attrs), screen: part(f, 'windscreen').map((s) => down(s.kids[0].attrs)) }))(faces(inp).front);
  assert.deepEqual(at(volvo), { h: 2800, badge: [2505, 2765], screen: [[160, 1760]] });
  assert.deepEqual(at({ ...volvo, band_below_windshield_mm: 900 }).screen, [[160, 1900]]);
  assert.deepEqual(at({ ...volvo, band_below_windshield_mm: 0 }).screen, [[160, 2325]]);
  assert.deepEqual(at({ ...volvo, band_below_grill_mm: 500, band_below_windshield_mm: 0 }), { h: 2800, badge: [2040, 2300], screen: [[160, 1860]] });
  assert.deepEqual(at(citaro).badge, [2055, 2315]);
  assert.deepEqual(at({ ...citaro, band_above_mm: 1000, band_below_grill_mm: 1200 }).screen, []);
});

const LAMP_BOX = VIEWBOX.exec(readFileSync(new URL('../src/headlight.svg', import.meta.url), 'utf8'))[1];

test('a headlight on each side of the badge, the right one the left one mirrored', () =>
  [volvo, citaro].forEach((inp) => {
    const [f] = faces(inp).front, [l, r] = part(f, 'headlight'), badge = part(f, 'badge')[0].attrs;
    assert.equal(part(f, 'headlight').length, 2);
    assert.equal(l.attrs.viewBox, LAMP_BOX);
    assert.equal(l.tag, 'svg');
    assert.ok(l.attrs.x > 0 && l.attrs.x + l.attrs.width < badge.x);
    assert.deepEqual(down(l.attrs), down(badge));
    assert.deepEqual([r.tag, r.attrs.transform], ['g', `translate(${f.w},0) scale(-1,1)`]);
    assert.deepEqual(r.kids.map(shape), [shape(l)]);
  }));

test('a given headlight replaces the default one, and stays untouched', () => {
  const own = node('svg', { viewBox: '0 0 10 5' }, [node('circle')]);
  const was = shape(own), [l, r] = part(faces(volvo, { headlight: own }).front[0], 'headlight');
  assert.deepEqual([l.attrs.viewBox, l.kids.map((k) => k.tag)], ['0 0 10 5', ['circle']]);
  assert.deepEqual(r.kids.map(shape), [shape(l)]);
  assert.deepEqual(shape(own), was);
  assert.notDeepEqual(shape(l), shape(part(faces(volvo).front[0], 'headlight')[0]));
});

test('a long badge text is set smaller, a short one at full size', () => {
  const text = (inp) => faces(inp).front[0].svg.kids.find((k) => k.tag === 'text').attrs;
  const size = (inp) => text(inp)['font-size'], long = (n) => ({ ...volvo, front: { badge_text: 'x'.repeat(n) } });
  assert.deepEqual([size(volvo), text(volvo)['letter-spacing']], [170, 10]);
  assert.ok(size(citaro) < size(volvo) && size(citaro) > 0);
  assert.ok(size(long(40)) < size(citaro));
  assert.ok(size(long(500)) > 0 && text(long(500))['letter-spacing'] > 0);
});

test('a bus without badge_text has no badge text', () => {
  const t = faces({ ...volvo, front: {} }).front[0].svg.kids.find((k) => k.tag === 'text');
  assert.ok(!t || t.kids.every((k) => k === ''));
});

test('a front_display text is shown on a display at the top of the windscreen, set smaller when it is long', () => {
  const at = (inp) => (([f]) => ({ pane: glazing(f, 'windscreen')[0]?.pane, sign: part(f, 'display').map(({ kids: [quad, text] }) => ({ quad: quad.attrs, text: text.attrs, label: text.kids[0] })) }))(faces(inp).front);
  const shown = (t, more = {}) => at({ ...volvo, front_display: t, ...more });
  assert.deepEqual(at({ ...volvo, front_display: undefined }).sign, []);
  assert.deepEqual(shown('').sign, []);
  const { pane, sign: [{ quad, text, label }] } = shown('21 Tjuvholmen');
  assert.equal(label, '21 Tjuvholmen');
  assert.deepEqual([quad.stroke, quad.y - pane.y, quad.x - pane.x, pane.x + pane.width - quad.x - quad.width, quad.height], ['darkgray', 40, 40, 40, 300]);
  assert.deepEqual([text.x, text.y, text['font-size']], [volvo.width_mm / 2, quad.y + 150, 200]);
  assert.ok(shown('x'.repeat(60)).sign[0].text['font-size'] < 200);
  assert.deepEqual(shown('21', { band_above_mm: 1000, band_below_grill_mm: 1200 }).sign, []);
  const low = shown('21', { band_below_windshield_mm: 2360 });  // a windscreen too low for a display
  assert.deepEqual([low.pane.height, low.sign], [190, []]);
});
