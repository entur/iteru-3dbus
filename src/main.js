import './style.css';
import { mkBus } from './bus.js';
import { total } from './derive.js';
import { mkStage } from './scene.js';
import { cards, header } from './ui.js';
import { validate } from './validate.js';
import { mkViews } from './views.js';

const MM = 0.001;
const FIRST = 'volvo-8900';

const buses = Object.entries(import.meta.glob('../examples/*.json', { eager: true, import: 'default' })).map(([p, inp]) => ({
  id: p.match(/([^/]+)\.json$/)[1],
  inp,
}));
const stage = mkStage(document.getElementById('stage'));
const err = document.getElementById('err');
let cur = null, len = 0;
const go = mkViews(stage, document.getElementById('views'), () => ({ group: cur, len }));

/** Swaps in the chosen bus, centred on the origin with the front towards -x, and re-aims the current view. */
const select = (id) => {
  const inp = buses.find((b) => b.id === id)?.inp;
  const errs = inp ? validate(inp) : [`no example named ${id}`];
  err.textContent = errs.join('\n');
  if (errs.length) return;
  const first = !cur;
  len = total(inp) * MM;
  cur && stage.drop(cur);
  cur = mkBus(inp);
  cur.position.x = -len / 2;
  stage.add(cur);
  go(undefined, first);
  header(buses, id, select);
  cards(inp);
};

const info = document.getElementById('info'), toggle = document.getElementById('toggle');
toggle.onclick = () => (toggle.ariaExpanded = String(info.classList.toggle('open')));

select(new URLSearchParams(location.search).get('bus') ?? FIRST);
