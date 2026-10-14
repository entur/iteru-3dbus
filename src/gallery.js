import { mkBus } from './bus.js';
import { hints, total } from './derive.js';
import { MM } from './dims.js';
import { signed } from './edit.js';
import { mkStage, ready } from './scene.js';
import { NAMES, el } from './ui.js';
import { faces } from './vector.js';
import { mkViews } from './views.js';

const SHOT_W = 640, SHOT_H = 360, VIEW = 'quarter';  // the one stage every card's picture is taken on, in css px
const CLOSER = 0.3;  // share of the way from the view's eye to its target: a card has no chrome to keep clear of
const TWO_DECKS = 'low_floor_lower_level', NOT_DRAWN = 'Two decks are not drawn yet';
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/**
 * Draws each bus on one off-screen stage, one after the other, and sets its picture as the src of
 * its img. One stage for all of them: a browser keeps only so many WebGL contexts alive.
 */
const shoot = (shots) => {
  const box = el('div');
  Object.assign(box.style, { position: 'fixed', left: `${-2 * SHOT_W}px`, top: '0', width: `${SHOT_W}px`, height: `${SHOT_H}px` });
  document.body.append(box);
  const stage = mkStage(box), cur = { group: null, len: 0 };
  const go = mkViews(stage, () => cur);
  const one = async ({ inp, img }) => {
    const group = mkBus(inp, faces(signed(inp))), len = total(inp) * MM;
    group.position.x = -len / 2;
    Object.assign(cur, { group, len });
    stage.add(group);
    go(VIEW, true);
    stage.cam.position.lerp(stage.ctl.target, CLOSER);
    await ready(group);
    img.src = stage.shot();
    stage.drop(group);
  };
  return shots.reduce((p, s) => p.then(() => one(s)), Promise.resolve()).finally(() => (stage.dispose(), box.remove()));
};

const card = (b, img, pick) => {
  const { inp } = b, axles = inp.sections.flatMap((s) => s.axles_mm).length;
  return el(
    'a',
    { className: 'card bus', href: `?bus=${b.id}`, onclick: (e) => (e.preventDefault(), pick(b.id)) },
    img,
    el('h2', {}, inp.model),
    el('p', {}, `Class ${inp.bus_class} · ${NAMES.floor_type[inp.floor_type]} · ${NAMES.body[inp.body]}`),
    el('p', {}, `${total(inp) / 1000} m · ${plural(axles, 'axle')} · ${plural(hints(inp).length, 'door')}`),
    ...(inp.floor_type === TWO_DECKS ? [el('p', {}, NOT_DRAWN)] : []),
  );
};

/**
 * A page of cards, one per bus: its 3D picture, model and main figures. The pictures are taken
 * once and come in one by one. A card opens its bus in the viewer.
 * @param {{id: string, inp: object}[]} buses valid buses to show, in the order of their cards
 * @param {(id: string) => void} pick called with the id of the card chosen
 * @returns {HTMLElement} the page
 */
export const gallery = (buses, pick) => {
  const shots = buses.map(({ inp }) => ({ inp, img: el('img', { src: BLANK, alt: `${inp.brand} ${inp.model} in 3D`, width: SHOT_W, height: SHOT_H }) }));
  shoot(shots);
  return el('div', { className: 'gallery' }, ...buses.map((b, i) => card(b, shots[i].img, pick)));
};
