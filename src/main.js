import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mkBus } from './bus.js';
import { total } from './derive.js';
import { validate } from './validate.js';

const MM = 0.001;
const BG = 0xe9edf0;
const FOV = 40, NEAR = 0.1, FAR = 200;

const examples = import.meta.glob('../examples/*.json', { eager: true, import: 'default' });
const pick = new URLSearchParams(location.search).get('bus') ?? 'volvo-8900';

const mount = (inp) => {
  const len = total(inp) * MM;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c99a7, 2), mkBus(inp));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(-len, len, -len);
  scene.add(sun);

  const cam = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, NEAR, FAR);
  cam.position.set(-len * 0.4, len * 0.3, -len * 0.9);
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
