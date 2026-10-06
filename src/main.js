import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { layout, total, tyreDia } from './derive.js';
import { validate } from './validate.js';

const MM = 0.001;
const CLEARANCE = 300, TYRE_W = 300, TYRE_OUT = 20, BELLOWS_INSET = 150;
const BG = 0xe9edf0, TYRE = 0x17202b, BELLOWS = 0x56626f;
const FOV = 40, NEAR = 0.1, FAR = 200;

const examples = import.meta.glob('../examples/*.json', { eager: true, import: 'default' });
const pick = new URLSearchParams(location.search).get('bus') ?? 'volvo-8900';

const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
const at = (m, x, y, z) => (m.position.set(x * MM, y * MM, z * MM), m);

/**
 * Builds the placeholder bus: one box per section, bellows between, a tyre pair per axle.
 * @param {object} inp validated bus input
 * @returns {THREE.Group} group in metres, front end at x = 0, ground at y = 0
 */
export const mkBus = (inp) => {
  const h = inp.height_mm - (inp.roof_equipment_mm ?? 0) - CLEARANCE;
  const w = inp.width_mm, r = tyreDia(inp.tyre) / 2;
  const tyre = () => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r * MM, r * MM, TYRE_W * MM, 32),
      new THREE.MeshStandardMaterial({ color: TYRE }),
    );
    m.rotation.x = Math.PI / 2;
    return m;
  };
  const parts = layout(inp).flatMap((s) => [
    at(box(s.len * MM, h * MM, w * MM, inp.base_color.hex), s.x0 + s.len / 2, CLEARANCE + h / 2, 0),
    ...(s.bellows
      ? [at(box(s.bellows * MM, (h - BELLOWS_INSET) * MM, (w - BELLOWS_INSET) * MM, BELLOWS), s.x0 - s.bellows / 2, CLEARANCE + h / 2, 0)]
      : []),
    ...s.axles.flatMap((x) => [-1, 1].map((side) => at(tyre(), x, r, side * ((w - TYRE_W) / 2 + TYRE_OUT)))),
  ]);
  return new THREE.Group().add(...parts);
};

const mount = (inp) => {
  const len = total(inp) * MM;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c99a7, 2), mkBus(inp));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(len, len, len);
  scene.add(sun);

  const cam = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, NEAR, FAR);
  cam.position.set(-len * 0.4, len * 0.45, len * 0.9);
  const gl = new THREE.WebGLRenderer({ antialias: true });
  gl.setPixelRatio(devicePixelRatio);
  document.body.append(gl.domElement);
  const ctl = new OrbitControls(cam, gl.domElement);
  ctl.target.set(len / 2, inp.height_mm * MM / 2, 0);

  const fit = () => {
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    gl.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', fit);
  fit();
  gl.setAnimationLoop(() => (ctl.update(), gl.render(scene, cam)));
};

const inp = examples[`../examples/${pick}.json`];
const errs = inp ? validate(inp) : [`no example named ${pick}`];
errs.length ? (document.getElementById('err').textContent = errs.join('\n')) : mount(inp);
