import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FOV = 32, FOV_TALL = 48, NEAR = 0.1, FAR = 300, MAX_DPR = 2;
const WIDE = 720, PANEL_SHIFT = 175;  // on wide screens the view shifts left, clear of the details panel
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
 * orbit controls. Colours follow the OS colour scheme.
 * @param {HTMLElement} el container the canvas fills
 * @returns {{cam: THREE.PerspectiveCamera, ctl: OrbitControls, add: (g: THREE.Object3D) => void,
 *   drop: (g: THREE.Object3D) => void, ticks: (() => void)[]}} add/drop swap a model in and out,
 *   ticks run before each frame
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

  const ticks = [];
  const fit = () => {
    const w = el.clientWidth, h = el.clientHeight;
    gl.setSize(w, h);
    cam.aspect = w / h;
    cam.fov = w < h ? FOV_TALL : FOV;
    w > WIDE ? cam.setViewOffset(w, h, PANEL_SHIFT, 0, w, h) : cam.clearViewOffset();
    cam.updateProjectionMatrix();
  };
  addEventListener('resize', fit);
  fit();
  gl.setAnimationLoop(() => (ticks.forEach((f) => f()), ctl.update(), gl.render(scene, cam)));

  return {
    cam, ctl, ticks,
    add: (g) => (g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true)), scene.add(g), (sun.shadow.needsUpdate = true)),
    drop: (g) => (scene.remove(g), dispose(g), (sun.shadow.needsUpdate = true)),
  };
};
