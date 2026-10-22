import { mkBus } from './bus.js';
import { total } from './derive.js';
import { MM } from './dims.js';
import { bgOf, mkStageShot } from './scene.js';
import { brief, el } from './ui.js';
import { faces } from './vector.js';
import { mkViews } from './views.js';

const SHOT_W = 640, SHOT_H = 360, VIEW = 'quarter';  // every card's picture, in css px
const CLOSER = 0.3;  // share of the way from the view's eye to its target: a card has no chrome to keep clear of
const DETAIL = 0.35;  // texture density for a card's picture, 1280 px wide at most: a third of the viewer's; shooting #busnordic went from 17 long tasks to 1
const SHOW = 'Show XML', OPEN = 'Open';  // the card's bar
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/**
 * Draws each bus on one stage, one after the other, and sets its picture as the src of its img.
 * One stage for all of them: a browser keeps only so many WebGL contexts alive. The pictures
 * take the colour behind the first img, so the page must be in the document by now.
 */
const shoot = (shots) => {
  const stage = mkStageShot({ w: SHOT_W, h: SHOT_H, bg: bgOf(shots[0].img) }), cur = { group: null, len: 0 };
  const go = mkViews(stage, () => cur);
  const one = async ({ inp, img }) => {
    const group = mkBus(inp, faces(inp), { detail: DETAIL }), len = total(inp) * MM;
    group.position.x = -len / 2;
    Object.assign(cur, { group, len });
    stage.add(group);
    try {
      go(VIEW, true);
      stage.cam.position.lerp(stage.ctl.target, CLOSER);
      const url = URL.createObjectURL(await stage.shot());
      img.onload = img.onerror = () => URL.revokeObjectURL(url);  // a loaded img keeps its picture: the blob need not outlive it
      img.src = url;
    } finally {
      stage.drop(group);
    }
  };
  // a bus that cannot be shot keeps its blank picture; the buses after it are still shot
  const each = (s) => one(s).catch((e) => console.warn(`no picture of ${s.id}:`, e));
  return shots.reduce((p, s) => p.then(() => each(s)), Promise.resolve()).finally(() => stage.dispose());
};

/** A card: the picture, id and main figures of a bus, or the errors of a file fromNetex rejected; a bar to its XML and, when valid, the viewer. */
const card = ({ id, file, inp, errs, src, href }, img, pick) =>
  el(
    'article',
    { className: inp ? 'card bus' : 'card bus bad' },
    ...(inp ? [img] : []),
    el('h2', {}, id),
    inp ? el('p', {}, brief(inp)) : el('ul', { className: 'errs' }, ...errs.map((e) => el('li', {}, e))),
    el(
      'footer', { className: 'bar' },
      el('a', { href: src, target: '_blank', rel: 'noopener' }, SHOW),
      inp ? el('a', { href, onclick: (e) => (e.preventDefault(), pick(file)) }, OPEN) : el('a', { ariaDisabled: 'true' }, OPEN),
    ),
  );

/**
 * A page of cards, one per file: the bus's 3D picture, id and main figures, or for a file that
 * fromNetex rejected its errors and no picture; each with a bar that opens the XML in a new tab
 * and the bus in the viewer. The pictures are taken once and come in one by one.
 * @param {{id: string, file: string, inp?: object, errs: string[], src: string, href: string}[]} buses
 *   the files to show, in the order of their cards; src: the XML's url, href: the bus's route
 * @param {(file: string) => void} pick called with the file of the card opened
 * @returns {HTMLElement} the page
 */
export const gallery = (buses, pick) => {
  const imgs = new Map(buses.filter((b) => b.inp).map((b) => [b, el('img', { src: BLANK, alt: `${b.id} in 3D`, width: SHOT_W, height: SHOT_H })]));
  imgs.size && queueMicrotask(() => shoot([...imgs].map(([{ id, inp }, img]) => ({ id, inp, img }))));
  return el('div', { className: 'gallery' }, ...buses.map((b) => card(b, imgs.get(b), pick)));
};
