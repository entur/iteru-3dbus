import { bodyTop, doors, layout, lintel, sill, windows } from './derive.js';
import { CLEARANCE, CORNER } from './dims.js';

const NS = 'http://www.w3.org/2000/svg';
const BADGE_AT = 0.3, BADGE_W = 0.5, BADGE_H = 260, BADGE_FONT = 170, BADGE_R = 40;
const BADGE = '#2b3136', BADGE_INK = '#eef2f5', FONT = 'Arial, Helvetica, sans-serif';
const DOOR_SILL = 40;  // door sill above the skirt
const FRAME = '#2b3136', FRAME_W = 45, FRAME_R = 30;  // around every pane of a door or window: colour, width, corner radius
const GLASS = '#6f8797';

const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  e.append(...kids);
  return e;
};
const face = (w, h, ...kids) => ({ w, h, svg: svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'face' }, ...kids) });
const plain = (w, h, fill) => svg('rect', { x: 0, y: 0, width: w, height: h, fill });

/** A frame on a side face across a span, from y down to y1, with n panes of one fill side by side in it. */
const framed = (cls, { x0, x1 }, y, y1, n, fill) => {
  const h = y1 - y, pw = (x1 - x0 - (n + 1) * FRAME_W) / n;
  return svg(
    'g', { class: cls },
    svg('rect', { x: x0, y, width: x1 - x0, height: h, rx: FRAME_R, fill: FRAME }),
    ...Array.from({ length: n }, (_, i) =>
      svg('rect', { x: x0 + FRAME_W + i * (pw + FRAME_W), y: y + FRAME_W, width: pw, height: h - 2 * FRAME_W, rx: FRAME_R, fill })),
  );
};

/** A door on a side face, from y down to its sill at y1: a frame with one pane per leaf, glass or body colour. */
const door = (y, y1, fill) => (d) => framed('door', d, y, y1, d.leaves, d.glazed ? GLASS : fill);

/** A window on a side face, from y down to y1: one pane of glass in a frame like a door's. */
const pane = (y, y1) => (w) => framed('window', w, y, y1, 1, GLASS);

/** A door or window span as it lies on the mirrored right side of a box. */
const flip = (len) => (d) => ({ ...d, x0: len - d.x1, x1: len - d.x0 });

/**
 * Side face of one box: skirt to roof with rounded corners, the window panes across the band
 * [lo, hi] above ground and the doors, which reach up to its top. No wheel arch: the model cuts
 * those out of the box, the map runs on under them.
 */
const side = (len, top, fill, ds = [], ws = [], [lo, hi] = [0, top]) => {
  const h = top - CLEARANCE, c = CORNER;
  const d = `M${c},${h} L${len - c},${h} Q${len},${h} ${len},${h - c} L${len},${c} Q${len},0 ${len - c},0 L${c},0 Q0,0 0,${c} L0,${h - c} Q0,${h} ${c},${h} Z`;
  return face(len, h, svg('path', { d, fill }), ...ws.map(pane(top - hi, top - lo)), ...ds.map(door(top - hi, h - DOOR_SILL, fill)));
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
 * exactly what is projected: nothing that is separate geometry (wheels, bellows, roof pod), and
 * nothing the model cuts out of a box (wheel arches).
 * Side maps come one per section, front to rear; on the right side the front points right. The
 * hinted doors and the side windows are on the right side only.
 * @param {object} inp validated bus input
 * @returns {Record<'right'|'left'|'front'|'rear', {svg: SVGSVGElement, w: number, h: number}[]>}
 */
export const faces = (inp) => {
  const top = bodyTop(inp), fill = inp.base_color.hex;
  const boxes = layout(inp), placed = doors(inp), glass = windows(inp), band = [sill(inp), lintel(inp)];
  const w = inp.width_mm, h = top - CLEARANCE - 2 * CORNER;
  return {
    right: boxes.map((b, i) => side(b.len, top, fill, placed[i].map(flip(b.len)), glass[i].map(flip(b.len)), band)),
    left: boxes.map((b) => side(b.len, top, fill)),
    front: [front(w, h, fill, inp.front?.badge_text ?? inp.brand)],
    rear: [face(w, h, plain(w, h, fill))],
  };
};
