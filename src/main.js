import './style.css';
import { mkBus } from './bus.js';
import { total } from './derive.js';
import { mkStage } from './scene.js';
import { header } from './ui.js';
import { validate } from './validate.js';

const MM = 0.001;
const EYE = [-13.2, 3.2, -15.2], AIM = [0, 1.5, 0], REF_LEN = 12.4;
const FIRST = 'volvo-8900';

const buses = Object.entries(import.meta.glob('../examples/*.json', { eager: true, import: 'default' })).map(([p, inp]) => ({
  id: p.match(/([^/]+)\.json$/)[1],
  inp,
}));
const stage = mkStage(document.getElementById('stage'));
const err = document.getElementById('err');
let cur = null;

/** Swaps in the chosen bus: centred on the origin, front towards -x, seen from the front entry side. */
const select = (id) => {
  const inp = buses.find((b) => b.id === id)?.inp;
  const errs = inp ? validate(inp) : [`no example named ${id}`];
  err.textContent = errs.join('\n');
  if (errs.length) return;
  const len = total(inp) * MM, k = Math.max(1, len / REF_LEN);
  cur && stage.drop(cur);
  cur = mkBus(inp);
  cur.position.x = -len / 2;
  stage.add(cur);
  stage.ctl.target.set(...AIM);
  stage.cam.position.set(...EYE.map((v, i) => (v - AIM[i]) * k + AIM[i]));
  header(buses, id, select);
};

select(new URLSearchParams(location.search).get('bus') ?? FIRST);
