import * as THREE from 'three';

const AIM = [0, 1.5, 0], REF_LEN = 12.4, FIT = 0.45;
const VIEWS = {
  quarter: ['3/4', [-13.2, 3.2, -15.2]],
  left: ['Left', [0, 2, 24]],
  right: ['Right', [0, 2, -24]],
  front: ['Front', [-19, 2.1, 0]],
  rear: ['Rear', [15, 4.5, 13]],
  top: ['Top', [0.01, 30, 0.01]],
};
const DUR = 650, LIFT = 1.25, LIFT_MARGIN = 0.22, BUMP = 0.18, MIN_PHI = 0.05;
const FRAME_ITERS = 3, FRAME_EPS = 0.002;

const half = (cam) => Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Pans a camera pose sideways until the model's projected bounding box is centred on screen. */
const frame = (cam0, group, pos, tgt) => {
  const cam = cam0.clone(), b = new THREE.Box3().setFromObject(group);
  const corners = Array.from({ length: 8 }, (_, c) => new THREE.Vector3(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z));
  return Array.from({ length: FRAME_ITERS }).reduce(
    ([p, t]) => {
      cam.position.copy(p);
      cam.lookAt(t);
      cam.updateMatrixWorld();
      const xs = corners.map((c) => c.clone().project(cam).x);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2 - t.clone().project(cam).x;
      if (Math.abs(cx) < FRAME_EPS) return [p, t];
      const sh = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(cx * p.distanceTo(t) * half(cam));
      return [p.clone().add(sh), t.clone().add(sh)];
    },
    [pos, tgt],
  );
};

/**
 * Builds the camera-view bar and flies the camera between named views. Long moves rise towards
 * the top on the way; dragging the scene cancels a flight.
 * @param {{cam: THREE.PerspectiveCamera, ctl: object, ticks: (() => void)[]}} stage from mkStage
 * @param {HTMLElement} nav container for the view buttons
 * @param {() => {group: THREE.Object3D, len: number}} model current model and its length in metres
 * @returns {(v?: string, instant?: boolean) => void} go: fly to view v (default: the current one)
 */
export const mkViews = (stage, nav, model) => {
  const { cam, ctl } = stage;
  let cur = 'quarter', anim = null;

  const go = (v = cur, instant = false) => {
    cur = v;
    const { group, len } = model();
    const aim = new THREE.Vector3(...AIM);
    const k = Math.max(1, FIT / half(cam)) * Math.max(1, len / REF_LEN);
    const eye = new THREE.Vector3(...VIEWS[v][1]).sub(aim).multiplyScalar(k).add(aim);
    const [to, tt] = v === 'top' ? [eye, aim] : frame(cam, group, eye, aim);
    [...nav.children].forEach((b) => (b.ariaPressed = String(b.dataset.view === v)));
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cam.position.copy(to);
      ctl.target.copy(tt);
      anim = null;
      return;
    }
    const from = cam.position.clone().sub(ctl.target), dest = to.clone().sub(tt);
    const sf = new THREE.Spherical().setFromVector3(from), st = new THREE.Spherical().setFromVector3(dest);
    const dth = Math.atan2(Math.sin(st.theta - sf.theta), Math.cos(st.theta - sf.theta));
    const ang = from.angleTo(dest) / Math.PI;
    const lift = Math.max(0, Math.min((sf.phi + st.phi) / 2 - LIFT_MARGIN, ang * LIFT));
    anim = { sf, st, dth, lift, bump: BUMP * ang, tf: ctl.target.clone(), tt, to, dur: DUR * (1 + ang), t0: performance.now() };
  };

  stage.ticks.push(() => {
    if (!anim) return;
    const t = Math.min(1, (performance.now() - anim.t0) / anim.dur), e = ease(t), arc = Math.sin(Math.PI * e);
    ctl.target.lerpVectors(anim.tf, anim.tt, e);
    cam.position
      .setFromSpherical(
        new THREE.Spherical(
          THREE.MathUtils.lerp(anim.sf.radius, anim.st.radius, e) * (1 + anim.bump * arc),
          Math.max(MIN_PHI, THREE.MathUtils.lerp(anim.sf.phi, anim.st.phi, e) - anim.lift * arc),
          anim.sf.theta + anim.dth * e,
        ),
      )
      .add(ctl.target);
    if (t >= 1) (cam.position.copy(anim.to), (anim = null));
  });
  ctl.addEventListener('start', () => (anim = null));

  nav.replaceChildren(
    ...Object.entries(VIEWS).map(([v, [label]]) => {
      const b = Object.assign(document.createElement('button'), { textContent: label, onclick: () => go(v) });
      b.dataset.view = v;
      return b;
    }),
  );
  return go;
};
