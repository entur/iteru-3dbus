import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validate } from '../src/validate.js';
import { limits } from '../src/limits.js';

const EX = new URL('../examples/', import.meta.url);
const read = (u) => JSON.parse(readFileSync(u, 'utf8'));
const volvo = read(new URL('volvo-8900.json', EX)), citaro = read(new URL('citaro-g.json', EX));
const nordic = readdirSync(new URL('busnordic/', EX)).map((f) => read(new URL(`busnordic/${f}`, EX)));
const sec = (inp, i, patch) => ({ ...inp, sections: inp.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

/** A bus of n sections, the first with the given axles; every length is set so the total is `len`. */
const sized = (n, axles, len) => {
  const first = { ...volvo.sections[0], axles_mm: axles, length_mm: len - (n - 1) * 3000 };
  const rest = Array.from({ length: n - 1 }, () => ({ length_mm: 2000, axles_mm: [1000], bellows_ahead_mm: 1000 }));
  return { ...volvo, sections: [first, ...rest] };
};

test('every example is within the Nordic limits', () => {
  const all = [volvo, citaro, ...nordic];
  assert.equal(all.length, 19);
  all.forEach((inp) => assert.deepEqual(limits(inp), [], inp.front_display));
});

test('width over 2550 is over the limit', () => {
  assert.equal(limits({ ...volvo, width_mm: 2551 }).length, 1);
  assert.deepEqual(limits({ ...volvo, width_mm: 2550 }), []);
});

test('height over 4400 is over the limit', () => {
  assert.equal(limits({ ...volvo, height_mm: 4401 }).length, 1);
  assert.deepEqual(limits({ ...volvo, height_mm: 4400 }), []);
});

test('total length by sections and axles', () => {
  const noDoors = (inp) => ({ ...inp, sections: inp.sections.map(({ doors_hint, ...s }) => s) });
  [[1, [2000, 8000], 13500], [1, [2000, 6000, 8000], 15000], [2, [2000, 8000], 18750], [3, [2000, 8000], 24000]].forEach(([n, ax, max]) => {
    assert.deepEqual(limits(noDoors(sized(n, ax, max))), [], `${n} sections ${ax.length} axles ${max}`);
    assert.equal(limits(noDoors(sized(n, ax, max + 1))).length, 1, `${n} sections ${ax.length} axles ${max + 1}`);
  });
});

test('over 9500 mm a bus with doors needs two', () => {
  const door = [{ zone: 'between_axles', leaves: 2 }];
  assert.equal(limits(sec(volvo, 0, { doors_hint: door })).length, 1);
  assert.equal(limits(sec(volvo, 0, { doors_hint: [] })).length, 1);
  const { doors_hint, ...bare } = volvo.sections[0];
  assert.deepEqual(limits({ ...volvo, sections: [bare] }), []);
});

test('a fantasy bus passes validate but not limits', () => {
  const fantasy = { ...volvo, width_mm: 3500, height_mm: 5000 };
  assert.deepEqual(validate(fantasy), []);
  assert.equal(limits(fantasy).length, 2);
});
