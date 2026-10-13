import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FOV = 32, FOV_TALL = 48, NEAR = 0.1, FAR = 300, MAX_DPR = 2, SHOT_Q = 0.9;
const FOG_NEAR = 40, FOG_FAR = 110, GROUND_R = 80;
const HEMI = 2.4, SUN = 2.7, FILL = 0.8;
const SUN_AT = [-14, 22, -18], FILL_AT = [15, 8, 10];
const SHADOW_MAP = 2048, SHADOW_BOX = 12, SHADOW_FAR = 70, SHADOW_BIAS = -0.0004;
const MIN_DIST = 5, MAX_DIST = 90, MAX_POLAR = Math.PI * 0.495;
const DAY = { sky: 0xe4eaee, ground: 0xf1f4f6, bounce: 0xbfc8ce }, NIGHT = { sky: 0x1a232a, ground: 0x2b353c, bounce: 0x2a3138 };

const dispose = (g) =>
  g.traverse((o) => {
    o.geometry?.dispose();
    [o.material ?? []].flat().forEach((m) => (m.map?.dispose(), m.dispose()));
  });

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
  gl.shadowMap.enabled = true;
  el.append(gl.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.sky, FOG_NEAR, FOG_FAR);

  const sun = new THREE.DirectionalLight(0xffffff, SUN);
  sun.position.set(...SUN_AT);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.autoUpdate = false;  // nothing moves: the shadow map is redrawn only when the model is swapped
  Object.assign(sun.shadow.camera, { left: -SHADOW_BOX, right: SHADOW_BOX, top: SHADOW_BOX, bottom: -SHADOW_BOX, near: 1, far: SHADOW_FAR });
  const fill = new THREE.DirectionalLight(0xdfe8ff, FILL);
  fill.position.set(...FILL_AT);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_R, 64), new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(new THREE.HemisphereLight(0xffffff, pal.bounce, HEMI), sun, fill, ground);

  const cam = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);
  const ctl = new OrbitControls(cam, gl.domElement);
  Object.assign(ctl, { enableDamping: true, maxPolarAngle: MAX_POLAR, minDistance: MIN_DIST, maxDistance: MAX_DIST });

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
    cam, ctl, ticks, fits,
    offset: (px) => ((shift = px), fit()),
    shot: () => (ctl.update(), gl.render(scene, cam), gl.domElement.toDataURL('image/jpeg', SHOT_Q)),  // read back in the task that drew it
    dispose: () => {
      gl.setAnimationLoop(null);
      ro.disconnect();
      ctl.dispose();
      dispose(scene);
      sun.dispose();
      gl.dispose();
      gl.domElement.remove();
    },
    add: (g) => (g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true)), scene.add(g), (sun.shadow.needsUpdate = true)),
    drop: (g) => (scene.remove(g), dispose(g), (sun.shadow.needsUpdate = true)),
  };
};
