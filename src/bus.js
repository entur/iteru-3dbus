import * as THREE from 'three';
import { arch, bodyTop, endH, layout, tyreDia } from './derive.js';
import { ARCH_GAP, BELLOWS_INSET, CLEARANCE, CORNER, END_EDGE, HUB_R, MM, POD_AT, POD_LEN, POD_MAX, POD_W, RIM_R, TWIN_GAP, TYRE_INSET, TYRE_W } from './dims.js';

const ARCH_SEG = 48, LINER_GAP = 5, LINER_INSET = 20, TYRE_SEG = 48;
const NUT_R = 18, NUT_RING = 160, NUTS = 10;
const SIDE_PX = 0.34, END_PX = 0.8, ANISO = 8, END_GAP = 3;  // face texture px per mm; end planes sit just off the body
const BODY_ROUGH = 0.4, BODY_METAL = 0.05;
const TYRE = 0x1d2124, RIM = 0xb8bfc4, HUB = 0x50585e, LINER = 0x22282c, BELLOWS = 0x56626f;
const NO_MAPS = 'faces must hold one side map per section and a front and a rear map, each an { svg, w, h } sized for this bus';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, ...o });
const at = (m, x, y, z) => (m.position.set(x * MM, y * MM, z * MM), m);
const axial = (r, len, seg, mat) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * MM, r * MM, len * MM, seg), mat);
  m.rotation.x = Math.PI / 2;
  return m;
};

/** Rasterises a copy of a face map into a texture; repeat/offset place it on UVs given in metres. */
const tex = (f, px, repeat = [1, 1], offset = [0, 0]) => {
  const svg = f.svg.cloneNode(true);
  svg.setAttribute('width', Math.round(f.w * px));
  svg.setAttribute('height', Math.round(f.h * px));
  const t = new THREE.TextureLoader().load(`data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  t.repeat.set(...repeat);
  t.offset.set(...offset);
  return t;
};

/** Side profile of one section in metres: rounded box with an arch cut out over each axle. */
const profile = (len, top, axles, r) => {
  const L = len * MM, H = top * MM, G = CLEARANCE * MM, c = CORNER * MM, cy = r * MM;
  const ar = arch(r), R = ar.R * MM, dl = ar.dl;
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
  const { R, dl } = arch(r, r + ARCH_GAP - LINER_GAP);
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

/** A face map of width w, and of height h where one is asked for. */
const isFace = (f, w, h) => typeof f?.svg?.cloneNode === 'function' && f.w === w && f.h === h;

/**
 * Checks that face maps are the ones mkBus can draw for an input: one side map per section, a
 * front and a rear map, each in the size that input gives its box.
 * @param {object} inp validated bus input
 * @param {object} maps face maps, as vector.js faces() returns them
 * @returns {string[]} errors, empty when the maps fit
 */
export const mapErrs = (inp, maps) => {
  const boxes = layout(inp), h = bodyTop(inp) - CLEARANCE;
  const sides = (fs) => fs?.length === boxes.length && boxes.every((b, i) => isFace(fs[i], b.len, h));
  const end = (fs) => isFace(fs?.[0], inp.width_mm, endH(inp));
  return sides(maps?.right) && sides(maps?.left) && end(maps?.front) && end(maps?.rear) ? [] : [NO_MAPS];
};

/**
 * Builds the bus: per section an extruded side profile with wheel arches, arch liners and wheels,
 * with bellows between sections. The face maps are projected onto both sides of every box, the
 * front of the first and the rear of the last; they are read, never changed. The body is drawn to height_mm minus roof_equipment_mm, with a
 * roof pod of that height on each section. Every axle but the first is twin when tyre.rear_twin is not false.
 * @param {object} inp validated bus input
 * @param {Record<'right'|'left'|'front'|'rear', {svg: SVGSVGElement, w: number, h: number}[]>} maps
 *   face maps for inp in mm, as vector.js faces() returns them: one side map per section
 * @param {{detail?: number}} [opts] detail scales the face textures' density (SIDE_PX, END_PX):
 *   1, the default, is for a bus filling the screen; a small picture needs far less
 * @returns {THREE.Group} group in metres, front end at x = 0 running towards +x, ground at y = 0
 */
export const mkBus = (inp, maps, { detail = 1 } = {}) => {
  const w = inp.width_mm, r = tyreDia(inp.tyre) / 2;
  const top = bodyTop(inp), roof = inp.roof_equipment_mm ?? 0;  // body stops below the roof pod
  const twin = inp.tyre.rear_twin ?? true;
  const zo = w / 2 - TYRE_INSET;
  const mats = {
    body: std(inp.base_color.hex, { roughness: BODY_ROUGH, metalness: BODY_METAL }),
    tyre: std(TYRE, { roughness: 0.9 }),
    rim: std(RIM, { roughness: 0.35, metalness: 0.6 }),
    hub: std(HUB, { roughness: 0.5, metalness: 0.5 }),
    liner: std(LINER, { roughness: 1, side: THREE.BackSide }),
    bellows: std(BELLOWS, { roughness: 0.9 }),
    pod: std(inp.base_color.hex, { roughness: 0.5 }),
  };
  const wh = wheel(r, mats), ln = liner(r, w, mats.liner);  // one of each, cloned per axle: clones share geometry
  const skin = (map) => std(0xffffff, { map, roughness: BODY_ROUGH, metalness: BODY_METAL });
  const end = (f, x, rot) => {
    const m = at(new THREE.Mesh(new THREE.PlaneGeometry(f.w * MM, f.h * MM), skin(tex(f, END_PX * detail))), x, END_EDGE + f.h / 2, 0);
    m.rotation.y = rot;
    return m;
  };

  const parts = layout(inp).flatMap((s, i) => {
    const geo = new THREE.ExtrudeGeometry(profile(s.len, top, s.local, r), { depth: w * MM, bevelEnabled: false, curveSegments: 8 });
    geo.translate(0, 0, (-w / 2) * MM);
    // caps come first, z = 0 (right side) then z = w (left side); walls after
    const [caps, walls] = geo.groups, n = caps.count / 2;
    geo.clearGroups();
    geo.addGroup(caps.start, n, 0);
    geo.addGroup(caps.start + n, n, 1);
    geo.addGroup(walls.start, walls.count, 2);
    const h = top - CLEARANCE, L = s.len * MM, v = [1 / (h * MM), -CLEARANCE / h];
    const sides = [tex(maps.right[i], SIDE_PX * detail, [-1 / L, v[0]], [1, v[1]]), tex(maps.left[i], SIDE_PX * detail, [1 / L, v[0]], [0, v[1]])];
    return [
      at(new THREE.Mesh(geo, [...sides.map(skin), mats.body]), s.x0, 0, 0),
      ...(i === 0 ? [end(maps.front[0], -END_GAP, -Math.PI / 2)] : []),
      ...(i === maps.left.length - 1 ? [end(maps.rear[0], s.x0 + s.len + END_GAP, Math.PI / 2)] : []),
      ...(s.bellows
        ? [at(new THREE.Mesh(new THREE.BoxGeometry(s.bellows * MM, (h - BELLOWS_INSET) * MM, (w - BELLOWS_INSET) * MM), mats.bellows), s.x0 - s.bellows / 2, CLEARANCE + h / 2, 0)]
        : []),
      ...(roof
        ? [at(new THREE.Mesh(new THREE.BoxGeometry(Math.min(POD_LEN, s.len * POD_MAX) * MM, roof * MM, w * POD_W * MM), mats.pod), s.x0 + s.len * POD_AT, top + roof / 2, 0)]
        : []),
      ...s.axles.flatMap((x, j) => [
        at(ln.clone(), x, r, 0),
        ...[-1, 1].flatMap((side) =>
          (twin && i + j > 0 ? [zo, zo - TWIN_GAP] : [zo]).map((z) => at(wh.clone(), x, r, side * z)),
        ),
      ]),
    ];
  });
  return new THREE.Group().add(...parts);
};
