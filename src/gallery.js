import { mkBus } from './bus.js';
import { hints, total } from './derive.js';
import { MM } from './dims.js';
import { signed } from './edit.js';
import { mkStage } from './scene.js';
import { NAMES, el } from './ui.js';
import { faces } from './vector.js';
import { mkViews } from './views.js';

const SHOT_W = 640, SHOT_H = 360, VIEW = 'quarter';  // the one stage every card's picture is taken on, in css px
const CLOSER = 0.3;  // share of the way from the view's eye to its target: a card has no chrome to keep clear of
const ORDER = ['A', 'I', 'II', 'B', 'III'];  // card order by class, as the Bus Nordic tables run; then by length
const TWO_DECKS = 'low_floor_lower_level', NOT_DRAWN = 'Two decks are not drawn yet';
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sorted = (buses) =>
  [...buses].sort((a, b) => ORDER.indexOf(a.inp.bus_class) - ORDER.indexOf(b.inp.bus_class) || total(a.inp) - total(b.inp));

/** Resolves once every texture of a model has its image: the face maps are rasterised off the main task. */
const ready = (g) => {
  const maps = [];
  g.traverse((o) => maps.push(...[o.material ?? []].flat().flatMap((m) => m.map ?? [])));
  return new Promise((res) => {
    const chk = () => (maps.every((t) => t.image) ? res() : requestAnimationFrame(chk));
    chk();
  });
};

/**
 * Draws each bus on one off-screen stage, one after the other, and hands over its picture. One
 * stage for all of them: a browser keeps only so many WebGL contexts alive.
 */
const shoot = (buses, put) => {
  const box = el('div');
  Object.assign(box.style, { position: 'fixed', left: `${-2 * SHOT_W}px`, top: '0', width: `${SHOT_W}px`, height: `${SHOT_H}px` });
  document.body.append(box);
  const stage = mkStage(box), cur = { group: null, len: 0 };
  const go = mkViews(stage, () => cur);
  const one = async (b) => {
    const group = mkBus(b.inp, faces(signed(b.inp))), len = total(b.inp) * MM;
    group.position.x = -len / 2;
    Object.assign(cur, { group, len });
    stage.add(group);
    go(VIEW, true);
    stage.cam.position.lerp(stage.ctl.target, CLOSER);
    await ready(group);
    put(b, stage.shot());
    stage.drop(group);
  };
  return buses.reduce((p, b) => p.then(() => one(b)), Promise.resolve()).finally(() => (stage.dispose(), box.remove()));
};

const card = (b, pick) => {
  const { inp } = b, axles = inp.sections.flatMap((s) => s.axles_mm).length;
  return el(
    'a',
    { className: 'card bus', href: `?bus=${b.id}`, onclick: (e) => (e.preventDefault(), pick(b.id)) },
    el('img', { src: BLANK, alt: `${inp.brand} ${inp.model} in 3D`, width: SHOT_W, height: SHOT_H }),
    el('h2', {}, inp.model),
    el('p', {}, `Class ${inp.bus_class} · ${NAMES.floor_type[inp.floor_type]} · ${NAMES.body[inp.body]}`),
    el('p', {}, `${total(inp) / 1000} m · ${plural(axles, 'axle')} · ${plural(hints(inp).length, 'door')}`),
    ...(inp.floor_type === TWO_DECKS ? [el('p', {}, NOT_DRAWN)] : []),
  );
};

/**
 * A page of cards, one per bus: its 3D picture, model and main figures. The pictures are taken
 * once and come in one by one. A card opens its bus in the viewer.
 * @param {{id: string, inp: object}[]} buses valid buses to show
 * @param {(id: string) => void} pick called with the id of the card chosen
 * @returns {HTMLElement} the page
 */
export const gallery = (buses, pick) => {
  const list = sorted(buses), cards = new Map(list.map((b) => [b.id, card(b, pick)]));
  shoot(list, (b, url) => (cards.get(b.id).querySelector('img').src = url));
  return el('div', { className: 'gallery' }, ...cards.values());
};
