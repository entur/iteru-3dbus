import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FOV = 32, FOV_TALL = 48, NEAR = 0.1, FAR = 300, MAX_DPR = 2, SHOT_Q = 0.9;
const FOG_NEAR = 40, FOG_FAR = 110, GROUND_R = 80, GROUND_SEG = 64;
const HEMI = 2.4, SUN = 2.7, FILL = 0.8;
const SUN_AT = [-14, 22, -18], FILL_AT = [15, 8, 10];
const SHADOW_MAP = 2048, SHADOW_BOX = 12, SHADOW_FAR = 70, SHADOW_BIAS = -0.0004;
const MIN_DIST = 5, MAX_DIST = 90, MAX_POLAR = Math.PI * 0.495;
const DAY = { sky: 0xe4eaee, ground: 0xf1f4f6, bounce: 0xbfc8ce }, NIGHT = { sky: 0x1a232a, ground: 0x2b353c, bounce: 0x2a3138 };
const PLANE_LIFT = 0.06, LIGHT_BG = 0.5;  // the plane: share of the way from its background to black (light one) or white (dark one)
const READY_MS = 5000;  // longest wait for a model's textures before a picture is taken anyway

const dispose = (g) =>
  g.traverse((o) => {
    o.geometry?.dispose();
    [o.material ?? []].flat().forEach((m) => (m.map?.dispose(), m.dispose()));
  });

/** Relative luminance of sRGB channels 0–1, not linearised: enough to tell a light background from a dark one. */
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const up = (e) => (e ? [e, ...up(e.parentElement)] : []);

/**
 * Reads a CSS colour as getComputedStyle or a custom property gives it.
 * @param {string} css `#rgb`, `#rrggbb`, `rgb(…)` or `rgba(…)`, comma or space separated
 * @returns {number[] | null} [r, g, b, a], each 0–1; null for anything else
 */
export const rgba = (css = '') => {
  const s = css.trim(), hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) return (hex.length === 3 ? hex.replace(/./g, '$&$&') : hex).match(/../g).map((h) => parseInt(h, 16) / 255).concat(1);
  const n = s.match(/^rgba?\(([^)]*)\)$/i)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number) ?? [];
  return n.length < 3 || n.some(Number.isNaN) ? null : [...n.slice(0, 3).map((v) => v / 255), n[3] ?? 1];
};

/**
 * Composites background colours over an opaque white canvas: the colour that shows through them all.
 * @param {number[][]} layers [r, g, b, a] each, the top one first
 * @returns {number[]} [r, g, b], each 0–1
 */
export const flat = (layers) => layers.reduceRight((under, [r, g, b, a]) => [r, g, b].map((c, i) => c * a + under[i] * (1 - a)), [1, 1, 1]);

/**
 * The ground colour for a picture that lies on bg: PLANE_LIFT of the way to black on a light
 * background, to white on a dark one, so the plane's edge against the sky shows.
 * @param {number[]} bg [r, g, b], each 0–1
 * @returns {number[]} [r, g, b], each 0–1
 */
export const plane = (bg) => {
  const to = lum(bg) > LIGHT_BG ? 0 : 1;
  return bg.map((c) => c + (to - c) * PLANE_LIFT);
};

/**
 * What shows through an element: its background and every ancestor's, composited over white.
 * An element outside the document has no computed colours and gives white.
 * @param {Element} el element a picture will lie on
 * @returns {string} that colour as `rgb(r g b)`, channels 0–255
 */
export const bgOf = (el) =>
  `rgb(${flat(up(el).map((e) => rgba(getComputedStyle(e).backgroundColor)).filter(Boolean)).map((c) => Math.round(c * 255)).join(' ')})`;

/**
 * Resolves once every texture under root has its image, or after ms: a face map is rasterised off
 * the main task, and one that never loads must not hold up the pictures after it.
 * @param {THREE.Object3D} root a model or a whole scene
 * @param {number} [ms] longest wait
 * @returns {Promise<void>}
 */
export const ready = (root, ms = READY_MS) => {
  const maps = [], t0 = performance.now();
  root.traverse((o) => maps.push(...[o.material ?? []].flat().flatMap((m) => m.map ?? [])));
  return new Promise((res) => {
    const chk = () => (maps.every((t) => t.image) || performance.now() - t0 > ms ? res() : requestAnimationFrame(chk));
    chk();
  });
};

const disc = (r, mat) => Object.assign(new THREE.Mesh(new THREE.CircleGeometry(r, GROUND_SEG), mat), { receiveShadow: true }).rotateX(-Math.PI / 2);

/** Scene, three lights, camera and orbit controls on gl, with the floor meshes; free disposes all of it but a model still added. */
const rig = (gl, pal, floor) => {
  gl.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, SUN);
  sun.position.set(...SUN_AT);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.autoUpdate = false;  // nothing moves: the shadow map is redrawn only when the model is swapped
  Object.assign(sun.shadow.camera, { left: -SHADOW_BOX, right: SHADOW_BOX, top: SHADOW_BOX, bottom: -SHADOW_BOX, near: 1, far: SHADOW_FAR });
  const fill = new THREE.DirectionalLight(0xdfe8ff, FILL);
  fill.position.set(...FILL_AT);
  scene.add(new THREE.HemisphereLight(0xffffff, pal.bounce, HEMI), sun, fill, ...floor);

  const cam = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);
  const ctl = new OrbitControls(cam, gl.domElement);
  Object.assign(ctl, { enableDamping: true, maxPolarAngle: MAX_POLAR, minDistance: MIN_DIST, maxDistance: MAX_DIST });
  return {
    scene, cam, ctl,
    add: (g) => (g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true)), scene.add(g), (sun.shadow.needsUpdate = true)),
    drop: (g) => (scene.remove(g), dispose(g), (sun.shadow.needsUpdate = true)),
    free: () => (ctl.dispose(), dispose(scene), sun.dispose(), gl.dispose()),
  };
};

/**
 * Sets up the stage: renderer with shadows, sky and fog, three lights, a ground disc and
 * orbit controls. Colours follow the OS colour scheme. The canvas follows the size of el.
 * @param {HTMLElement} el container the canvas fills
 * @returns {{cam: THREE.PerspectiveCamera, ctl: OrbitControls, add: (g: THREE.Object3D) => void,
 *   drop: (g: THREE.Object3D) => void, ticks: (() => void)[], fits: (() => void)[],
 *   offset: (px: number) => void, shot: () => string, dispose: () => void}} add/drop swap a model
 *   in and out, ticks run before each frame, fits after each resize, offset shifts the view
 *   sideways, shot draws a frame and returns it as a JPEG data URL, dispose stops the loop and
 *   frees everything but a model still added
 */
export const mkStage = (el) => {
  const pal = matchMedia('(prefers-color-scheme: dark)').matches ? NIGHT : DAY;
  const gl = new THREE.WebGLRenderer({ antialias: true });
  gl.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));
  el.append(gl.domElement);
  const { scene, cam, ctl, add, drop, free } = rig(gl, pal, [disc(GROUND_R, new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 1 }))]);
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.sky, FOG_NEAR, FOG_FAR);

  const ticks = [], fits = [];
  let shift = 0;
  const frame = () => (ticks.forEach((f) => f()), ctl.update(), gl.render(scene, cam));
  const fit = () => {
    const w = el.clientWidth, h = el.clientHeight;
    gl.setAnimationLoop(w && h ? frame : null);  // a box without a size is not on screen: nothing is drawn for it
    if (!w || !h) return;
    gl.setSize(w, h);
    cam.aspect = w / h;
    cam.fov = w < h ? FOV_TALL : FOV;
    shift ? cam.setViewOffset(w, h, shift, 0, w, h) : cam.clearViewOffset();
    cam.updateProjectionMatrix();
    fits.forEach((f) => f());
    gl.render(scene, cam);  // resizing clears the canvas: redraw before the browser paints
  };
  const ro = new ResizeObserver(fit);
  ro.observe(el);
  fit();

  return {
    cam, ctl, ticks, fits, add, drop,
    offset: (px) => ((shift = px), fit()),
    shot: () => (ctl.update(), gl.render(scene, cam), gl.domElement.toDataURL('image/jpeg', SHOT_Q)),  // read back in the task that drew it
    dispose: () => (gl.setAnimationLoop(null), ro.disconnect(), free(), gl.domElement.remove()),
  };
};
