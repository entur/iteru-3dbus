import './style.css';
import { mkBus } from './bus.js';
import { total } from './derive.js';
import { mkStage } from './scene.js';
import { validate } from './validate.js';

const MM = 0.001;
const EYE = [-13.2, 3.2, -15.2], AIM = [0, 1.5, 0], REF_LEN = 12.4;

const examples = import.meta.glob('../examples/*.json', { eager: true, import: 'default' });
const pick = new URLSearchParams(location.search).get('bus') ?? 'volvo-8900';
const stage = mkStage(document.getElementById('stage'));

/** Centres the bus on the origin, front towards -x, and looks at it from the front entry side. */
const show = (inp) => {
  const len = total(inp) * MM, k = Math.max(1, len / REF_LEN);
  const bus = mkBus(inp);
  bus.position.x = -len / 2;
  stage.add(bus);
  stage.ctl.target.set(...AIM);
  stage.cam.position.set(...EYE.map((v, i) => (v - AIM[i]) * k + AIM[i]));
};

const inp = examples[`../examples/${pick}.json`];
const errs = inp ? validate(inp) : [`no example named ${pick}`];
errs.length ? (document.getElementById('err').textContent = errs.join('\n')) : show(inp);
