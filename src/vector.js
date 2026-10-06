import { layout, total, tyreDia } from './derive.js';
import { ARCH_GAP, BELLOWS_INSET, CLEARANCE, CORNER, HUB_R, POD_AT, POD_LEN, POD_MAX, POD_W, RIM_R, TYRE_INSET, TYRE_W } from './dims.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = 120, FRONT_CORNER = 180;
const BADGE_AT = 0.3, BADGE_W = 0.5, BADGE_H = 260, BADGE_FONT = 170;
const TYRE = '#1d2124', RIM = '#b8bfc4', HUB = '#50585e', BELLOWS = '#56626f', BADGE = '#2b3136', BADGE_INK = '#eef2f5';

const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  e.append(...kids);
  return e;
};
const rect = (x, y, w, h, fill, o = {}) => svg('rect', { x, y, width: w, height: h, fill, ...o });
const frame = (w, h, label, ...kids) =>
  svg('svg', { viewBox: `${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}`, role: 'img', 'aria-label': label, class: 'vec' },
    ...kids, svg('line', { x1: -PAD, y1: h, x2: w + PAD, y2: h, class: 'ground' }));

/** Side outline in screen mm (y down): rounded box from sx, with an arch over each axle. */
const outline = (sx, len, y, top, axles, r) => {
  const R = r + ARCH_GAP, dx = Math.sqrt(R * R - (r - CLEARANCE) ** 2);
  const x1 = sx + len, g = y(CLEARANCE), t = y(top), c = CORNER;
  return [
    `M${sx + c},${g}`,
    ...axles.map((a) => `L${a - dx},${g} A${R},${R} 0 1 1 ${a + dx},${g}`),
    `L${x1 - c},${g} Q${x1},${g} ${x1},${g - c} L${x1},${t + c} Q${x1},${t} ${x1 - c},${t}`,
    `L${sx + c},${t} Q${sx},${t} ${sx},${t + c} L${sx},${g - c} Q${sx},${g} ${sx + c},${g} Z`,
  ].join(' ');
};

/**
 * Entry-side elevation as an SVG, to scale in mm: body outline with wheel arches, wheels,
 * bellows and roof pod. The front points right when the doors are on the right.
 * @param {object} inp validated bus input
 * @returns {SVGSVGElement}
 */
export const sideSvg = (inp) => {
  const len = total(inp), h = inp.height_mm, roof = inp.roof_equipment_mm ?? 0, top = h - roof;
  const r = tyreDia(inp.tyre) / 2, body = inp.base_color.hex;
  const flip = (inp.door_side ?? 'right') === 'right';
  const x = (v) => (flip ? len - v : v), y = (v) => h - v;
  const parts = layout(inp).flatMap((s) => {
    const sx = Math.min(x(s.x0), x(s.x0 + s.len)), axles = s.axles.map(x).sort((a, b) => a - b);
    const pod = Math.min(POD_LEN, s.len * POD_MAX);
    return [
      ...(s.bellows ? [rect(Math.min(x(s.x0), x(s.x0 - s.bellows)), y(top - BELLOWS_INSET / 2), s.bellows, top - CLEARANCE - BELLOWS_INSET, BELLOWS)] : []),
      ...(roof ? [rect(x(s.x0 + s.len * POD_AT) - pod / 2, y(h), pod, roof, body, { class: 'edge' })] : []),
      svg('path', { d: outline(sx, s.len, y, top, axles, r), fill: body, class: 'edge' }),
      ...axles.flatMap((a) => [[r, TYRE], [RIM_R, RIM], [HUB_R, HUB]].map(([rad, fill]) => svg('circle', { cx: a, cy: y(r), r: rad, fill, class: 'edge' }))),
    ];
  });
  return frame(len, h, `${inp.door_side ?? 'right'} side elevation`, ...parts);
};

/**
 * Front elevation as an SVG, to scale in mm: body outline, tyres, roof pod and the brand badge
 * that stands in for the grille.
 * @param {object} inp validated bus input
 * @returns {SVGSVGElement}
 */
export const frontSvg = (inp) => {
  const w = inp.width_mm, h = inp.height_mm, roof = inp.roof_equipment_mm ?? 0, top = h - roof;
  const r = tyreDia(inp.tyre) / 2, body = inp.base_color.hex;
  const y = (v) => h - v, by = y(CLEARANCE + (top - CLEARANCE) * BADGE_AT);
  const text = svg('text', { x: w / 2, y: by, class: 'badge', 'font-size': BADGE_FONT, fill: BADGE_INK }, (inp.front?.badge_text ?? inp.brand).toUpperCase());
  return frame(
    w, h, 'front elevation',
    ...[TYRE_INSET, w - TYRE_INSET].map((cx) => rect(cx - TYRE_W / 2, y(2 * r), TYRE_W, 2 * r, TYRE, { rx: 60, class: 'edge' })),
    ...(roof ? [rect((w * (1 - POD_W)) / 2, y(h), w * POD_W, roof, body, { class: 'edge' })] : []),
    rect(0, y(top), w, top - CLEARANCE, body, { rx: FRONT_CORNER, class: 'edge' }),
    rect((w * (1 - BADGE_W)) / 2, by - BADGE_H / 2, w * BADGE_W, BADGE_H, BADGE, { rx: 40 }),
    text,
  );
};
