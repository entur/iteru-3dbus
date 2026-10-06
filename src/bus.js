import * as THREE from 'three';
import { layout, tyreDia } from './derive.js';

const MM = 0.001;
const CLEARANCE = 320, CORNER = 90, BELLOWS_INSET = 150;
const ARCH_GAP = 110, ARCH_SEG = 48, LINER_GAP = 5, LINER_INSET = 20;
const TYRE_W = 295, TYRE_INSET = 160, TWIN_GAP = 310, TYRE_SEG = 48;
const RIM_R = 290, HUB_R = 110, NUT_R = 18, NUT_RING = 160, NUTS = 10;
const BODY_ROUGH = 0.4, BODY_METAL = 0.05;
const TYRE = 0x1d2124, RIM = 0xb8bfc4, HUB = 0x50585e, LINER = 0x22282c, BELLOWS = 0x56626f;

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, ...o });
const at = (m, x, y, z) => (m.position.set(x * MM, y * MM, z * MM), m);
const axial = (r, len, seg, mat) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * MM, r * MM, len * MM, seg), mat);
  m.rotation.x = Math.PI / 2;
  return m;
};

/** Side profile of one section in metres: rounded box with an arch cut out over each axle. */
const profile = (len, top, axles, r) => {
  const L = len * MM, H = top * MM, G = CLEARANCE * MM, c = CORNER * MM, R = (r + ARCH_GAP) * MM, cy = r * MM;
  const dl = Math.asin((cy - G) / R);
  const s = new THREE.Shape();
  s.moveTo(c, G);
  axles.forEach((ax) =>
    Array.from({ length: ARCH_SEG + 1 }, (_, i) => Math.PI + dl - ((Math.PI + 2 * dl) * i) / ARCH_SEG).forEach((t) =>
      s.lineTo(ax * MM + R * Math.cos(t), cy + R * Math.sin(t)),
    ),
  );
  s.lineTo(L - c, G);
  s.quadraticCurveTo(L, G, L, G + c);
  s.lineTo(L, H - c);
  s.quadraticCurveTo(L, H, L - c, H);
  s.lineTo(c, H);
  s.quadraticCurveTo(0, H, 0, H - c);
  s.lineTo(0, G + c);
  s.quadraticCurveTo(0, G, c, G);
  return s;
};

/** Dark inner wall of a wheel arch: an open half-pipe across the width, cut off at the skirt. */
const liner = (r, w, mat) => {
  const R = r + ARCH_GAP - LINER_GAP, dl = Math.asin((r - CLEARANCE) / R);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(R * MM, R * MM, (w - LINER_INSET) * MM, 40, 1, true, Math.PI / 2 - dl, Math.PI + 2 * dl),
    mat,
  );
  m.rotation.x = Math.PI / 2;
  return m;
};

/** One wheel: tyre, rim, hub and a ring of nuts. */
const wheel = (r, mats) => {
  const nuts = Array.from({ length: NUTS }, (_, i) => (i / NUTS) * Math.PI * 2).map((a) =>
    at(axial(NUT_R, TYRE_W + 40, 8, mats.hub), Math.cos(a) * NUT_RING, Math.sin(a) * NUT_RING, 0),
  );
  return new THREE.Group().add(
    axial(r, TYRE_W, TYRE_SEG, mats.tyre),
    axial(RIM_R, TYRE_W + 6, 40, mats.rim),
    axial(HUB_R, TYRE_W + 30, 24, mats.hub),
    ...nuts,
  );
};

/**
 * Builds the bus: per section an extruded side profile with wheel arches, arch liners and wheels,
 * with bellows between sections. Every axle but the first is twin when tyre.rear_twin is not false.
 * @param {object} inp validated bus input
 * @returns {THREE.Group} group in metres, front end at x = 0 running towards +x, ground at y = 0
 */
export const mkBus = (inp) => {
  const w = inp.width_mm, r = tyreDia(inp.tyre) / 2;
  const top = inp.height_mm - (inp.roof_equipment_mm ?? 0);
  const twin = inp.tyre.rear_twin ?? true;
  const zo = w / 2 - TYRE_INSET;
  const mats = {
    body: std(inp.base_color.hex, { roughness: BODY_ROUGH, metalness: BODY_METAL }),
    tyre: std(TYRE, { roughness: 0.9 }),
    rim: std(RIM, { roughness: 0.35, metalness: 0.6 }),
    hub: std(HUB, { roughness: 0.5, metalness: 0.5 }),
    liner: std(LINER, { roughness: 1, side: THREE.BackSide }),
    bellows: std(BELLOWS, { roughness: 0.9 }),
  };

  const parts = layout(inp).flatMap((s, i) => {
    const local = s.axles.map((a) => a - s.x0);
    const geo = new THREE.ExtrudeGeometry(profile(s.len, top, local, r), { depth: w * MM, bevelEnabled: false, curveSegments: 8 });
    geo.translate(0, 0, (-w / 2) * MM);
    const h = top - CLEARANCE;
    return [
      at(new THREE.Mesh(geo, mats.body), s.x0, 0, 0),
      ...(s.bellows
        ? [at(new THREE.Mesh(new THREE.BoxGeometry(s.bellows * MM, (h - BELLOWS_INSET) * MM, (w - BELLOWS_INSET) * MM), mats.bellows), s.x0 - s.bellows / 2, CLEARANCE + h / 2, 0)]
        : []),
      ...s.axles.flatMap((x, j) => [
        at(liner(r, w, mats.liner), x, r, 0),
        ...[-1, 1].flatMap((side) =>
          (twin && i + j > 0 ? [zo, zo - TWIN_GAP] : [zo]).map((z) => at(wheel(r, mats), x, r, side * z)),
        ),
      ]),
    ];
  });
  return new THREE.Group().add(...parts);
};
