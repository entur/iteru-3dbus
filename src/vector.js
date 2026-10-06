import { arch, bodyTop, layout, tyreDia } from './derive.js';
import { CLEARANCE, CORNER } from './dims.js';

const NS = 'http://www.w3.org/2000/svg';
const BADGE_AT = 0.3, BADGE_W = 0.5, BADGE_H = 260, BADGE_FONT = 170, BADGE_R = 40;
const BADGE = '#2b3136', BADGE_INK = '#eef2f5', FONT = 'Arial, Helvetica, sans-serif';

const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  e.append(...kids);
  return e;
};
const face = (w, h, ...kids) => ({ w, h, svg: svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'face' }, ...kids) });
const plain = (w, h, fill) => svg('rect', { x: 0, y: 0, width: w, height: h, fill });

/** Side face of one box: skirt to roof, with an arch cut out over each axle (x from the left edge). */
const side = (len, top, axles, r, fill) => {
  const h = top - CLEARANCE, { R, dx } = arch(r), c = CORNER;
  const d = [
    `M${c},${h}`,
    ...axles.map((a) => `L${a - dx},${h} A${R},${R} 0 1 1 ${a + dx},${h}`),
    `L${len - c},${h} Q${len},${h} ${len},${h - c} L${len},${c} Q${len},0 ${len - c},0`,
    `L${c},0 Q0,0 0,${c} L0,${h - c} Q0,${h} ${c},${h} Z`,
  ].join(' ');
  return face(len, h, svg('path', { d, fill }));
};

/** Front face: body colour with the brand badge that stands in for the grille. */
const front = (w, h, fill, text) => {
  const cy = h * (1 - BADGE_AT);
  return face(
    w, h,
    plain(w, h, fill),
    svg('rect', { x: (w * (1 - BADGE_W)) / 2, y: cy - BADGE_H / 2, width: w * BADGE_W, height: BADGE_H, rx: BADGE_R, fill: BADGE }),
    svg('text', { x: w / 2, y: cy, fill: BADGE_INK, 'font-family': FONT, 'font-size': BADGE_FONT, 'font-weight': 600, 'letter-spacing': 10, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, text.toUpperCase()),
  );
};

/**
 * The 2D maps projected onto the faces of the bus boxes, in mm and as seen from outside. These
 * are the single source for both the 3D face textures and the vector-map card, so the card shows
 * exactly what is on the model: nothing that is separate geometry (wheels, bellows, roof pod).
 * Side maps come one per section, front to rear; on the right side the front points right.
 * @param {object} inp validated bus input
 * @returns {Record<'right'|'left'|'front'|'rear', {svg: SVGSVGElement, w: number, h: number}[]>}
 */
export const faces = (inp) => {
  const top = bodyTop(inp), r = tyreDia(inp.tyre) / 2, fill = inp.base_color.hex;
  const boxes = layout(inp);
  const w = inp.width_mm, h = top - CLEARANCE - 2 * CORNER;
  return {
    right: boxes.map((b) => side(b.len, top, b.local.map((a) => b.len - a).reverse(), r, fill)),
    left: boxes.map((b) => side(b.len, top, b.local, r, fill)),
    front: [front(w, h, fill, inp.front?.badge_text ?? inp.brand)],
    rear: [face(w, h, plain(w, h, fill))],
  };
};
