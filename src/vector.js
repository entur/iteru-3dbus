import { bodyTop, dash, doors, endH, grill, layout, lintel, sill, windows, windowsLeft } from './derive.js';
import { CLEARANCE, CORNER } from './dims.js';
import LAMP from './headlight.svg?raw';

const NS = 'http://www.w3.org/2000/svg', SVG = 'image/svg+xml';
const BADGE_W = 0.5, BADGE_H = 260, BADGE_FONT = 170, BADGE_R = 40;
const BADGE_PAD = 60, BADGE_SPACING = 10, GLYPH = 0.72;  // text kept inside the badge: side padding, letter spacing at full size, glyph width per font size
const BADGE = '#2b3136', BADGE_INK = '#eef2f5', FONT = 'Arial, Helvetica, sans-serif';
const DISPLAY_H = 300, DISPLAY_MIN = 120, DISPLAY_GAP = 40, DISPLAY_PAD = 50;  // destination display in the windscreen: height aimed at, lowest one drawn, glass left around it, side padding of its text
const DISPLAY_FONT = 200, DISPLAY_FILL = 0.7, DISPLAY_SPACING = 10, DISPLAY_EDGE_W = 20;  // text size aimed at and its largest share of the display's height
const DISPLAY = '#14181b', DISPLAY_EDGE = 'darkgray', DISPLAY_INK = '#ffb000';
const DOOR_SILL = 40;  // door sill above the skirt
const FRAME = '#2b3136', FRAME_W = 45, FRAME_R = 30;  // around every pane of a door or window: colour, width, corner radius
const GLASS = '#6f8797';
const SCREEN_SIDE = 110, SCREEN_GAP = 180;  // windscreen: body left beside it, and at least this much between it and the badge
const LAMP_SIDE = 110, LAMP_GAP = 70;  // headlight: body left outside it, gap to the badge

const attr = (e, attrs) => (Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)), e);
const svg = (tag, attrs = {}, ...kids) => {
  const e = attr(document.createElementNS(NS, tag), attrs);
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

/** Font size at which a text stays inside a width: the full size, or smaller for a long text. track is the letter spacing per font size. */
const fit = (text, width, full, track) => Math.min(full, width / (text.length * (GLYPH + track)));

/** A text on a front map, centred on x, y. track is its letter spacing per font size. */
const label = (text, x, y, size, track, fill) =>
  svg('text', { x, y, fill, 'font-family': FONT, 'font-size': size, 'font-weight': 600, 'letter-spacing': size * track, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, text);

/**
 * The destination display at the top of the windscreen's pane, which lies at x, y and is w by h:
 * a dark quad with an outline, the text centred in it and set smaller when it is long. Nothing
 * where the pane is too low for it.
 */
const display = (text, x, y, w, h) => {
  const dw = w - 2 * DISPLAY_GAP, dh = Math.min(DISPLAY_H, h - 2 * DISPLAY_GAP), track = DISPLAY_SPACING / DISPLAY_FONT;
  const size = Math.min(fit(text, dw - 2 * DISPLAY_PAD, DISPLAY_FONT, track), dh * DISPLAY_FILL);
  return dh < DISPLAY_MIN ? [] : [svg(
    'g', { class: 'display' },
    svg('rect', { x: x + DISPLAY_GAP, y: y + DISPLAY_GAP, width: dw, height: dh, fill: DISPLAY, stroke: DISPLAY_EDGE, 'stroke-width': DISPLAY_EDGE_W }),
    label(text, x + w / 2, y + DISPLAY_GAP + dh / 2, size, track, DISPLAY_INK),
  )];
};

let parsed;
/** The default headlight: the drawing in headlight.svg, the left one as the front map shows it. Parsed once, on first use. */
const headlight = () => (parsed ??= new DOMParser().parseFromString(LAMP, SVG).documentElement);

/**
 * Front face: body colour, the badge that stands in for the grille standing on the grill
 * line, a headlight on each side of it (a copy of the drawing fitted in, and the same mirrored;
 * the drawing itself stays untouched), and a windscreen from the lintel line down to the dash
 * line, stopping above the badge and left out where that leaves it no room. The lines are y on
 * the map. A long badge text is set smaller, its letter spacing with it, so it stays inside the
 * badge and clear of the headlights however long it is. A sign text is shown on a destination
 * display at the top of the windscreen, when there is one.
 */
const front = (w, h, fill, text, { lintel: y, grill: y1, dash: y2 }, light, sign) => {
  const by = y1 - BADGE_H, cy = y1 - BADGE_H / 2, bx = (w * (1 - BADGE_W)) / 2, ys = Math.min(y2, by - SCREEN_GAP);
  const name = text.toUpperCase(), track = BADGE_SPACING / BADGE_FONT;  // letter spacing per font size
  const size = fit(name, w * BADGE_W - 2 * BADGE_PAD, BADGE_FONT, track), screen = ys - y > 2 * FRAME_W, edge = SCREEN_SIDE + FRAME_W;
  const left = attr(light.cloneNode(true), { class: 'headlight', x: LAMP_SIDE, y: by, width: bx - LAMP_GAP - LAMP_SIDE, height: BADGE_H });
  return face(
    w, h,
    plain(w, h, fill),
    ...(screen ? [framed('windscreen', { x0: SCREEN_SIDE, x1: w - SCREEN_SIDE }, y, ys, 1, GLASS)] : []),
    ...(screen && sign ? display(sign, edge, y + FRAME_W, w - 2 * edge, ys - y - 2 * FRAME_W) : []),
    left,
    svg('g', { class: 'headlight', transform: `translate(${w},0) scale(-1,1)` }, left.cloneNode(true)),
    svg('rect', { class: 'badge', x: bx, y: by, width: w * BADGE_W, height: BADGE_H, rx: BADGE_R, fill: BADGE }),
    label(name, w / 2, cy, size, track, BADGE_INK),
  );
};

/**
 * The 2D maps projected onto the faces of the bus boxes, in mm and as seen from outside. These
 * are the single source for both the 3D face textures and the vector-map card, so the card shows
 * exactly what is projected: nothing that is separate geometry (wheels, bellows, roof pod), and
 * nothing the model cuts out of a box (wheel arches).
 * Side maps come one per section, front to rear; on the right side the front points right. The
 * hinted doors are on the right side only; the left side has a pane for each pane and each door
 * of the right side, in one run. The front map has a windscreen
 * up to the same line as those and down to the line band_below_windshield_mm gives, and the
 * badge with a headlight on each side standing on the line band_below_grill_mm gives. A
 * front_display text is shown on a destination display at the top of the windscreen.
 * @param {object} inp validated bus input
 * @param {object} [opts]
 * @param {SVGSVGElement} [opts.headlight] drawing of the left headlight as the front map shows
 *   it, with a viewBox; it is fitted beside the badge and mirrored for the right one. Left
 *   untouched: the map holds copies.
 * @returns {Record<'right'|'left'|'front'|'rear', {svg: SVGSVGElement, w: number, h: number}[]>}
 */
export const faces = (inp, { headlight: light } = {}) => {
  const top = bodyTop(inp), fill = inp.base_color.hex;
  const boxes = layout(inp), placed = doors(inp), glass = windows(inp), across = windowsLeft(inp), band = [sill(inp), lintel(inp)];
  const up = (mm) => top - CORNER - mm;  // mm above ground as y on an end map, which starts CORNER below the body top
  const w = inp.width_mm, h = endH(inp);
  const lines = { lintel: Math.max(up(band[1]), 0), grill: up(grill(inp)), dash: up(dash(inp)) };
  return {
    right: boxes.map((b, i) => side(b.len, top, fill, placed[i].map(flip(b.len)), glass[i].map(flip(b.len)), band)),
    left: boxes.map((b, i) => side(b.len, top, fill, [], across[i], band)),
    front: [front(w, h, fill, inp.front?.badge_text ?? '', lines, light ?? headlight(), inp.front_display)],
    rear: [face(w, h, plain(w, h, fill))],
  };
};
