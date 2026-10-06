import './style.css';
import './bus-2d.js';
import './bus-3d.js';
import { cards, header, viewBar } from './ui.js';
import { validate } from './validate.js';

const FIRST = 'volvo-8900';
const WIDE = 720, PANEL_SHIFT = 175;  // on wide screens the view shifts left, clear of the details panel

const srcs = import.meta.glob('../examples/*.json', { eager: true, query: '?url', import: 'default' });
const buses = Object.entries(import.meta.glob('../examples/*.json', { eager: true, import: 'default' })).map(([p, inp]) => ({
  id: p.match(/([^/]+)\.json$/)[1],
  inp,
  src: srcs[p],
}));
const bus = document.querySelector('bus-3d'), map = document.createElement('bus-2d');
const err = document.getElementById('err');

/** Hands the chosen bus to the 2D element, and its maps on to the 3D element, which swaps the model in. */
const select = (id) => {
  const inp = buses.find((b) => b.id === id)?.inp;
  const errs = inp ? validate(inp) : [`no example named ${id}`];
  err.textContent = errs.join('\n');
  if (errs.length) return;
  map.inp = inp;
  bus.faces = map.faces;
  bus.inp = inp;
  header(buses, id, select);
  cards(inp, map);
};

bus.addEventListener('busrender', () => bus.go());  // another bus: re-aim the current view at it
bus.addEventListener('buserror', (e) => (err.textContent = e.detail.errors.join('\n')));

const wide = matchMedia(`(min-width: ${WIDE + 1}px)`);
const shift = () => (bus.offsetX = wide.matches ? PANEL_SHIFT : 0);
wide.addEventListener('change', shift);
shift();
viewBar(bus);

const info = document.getElementById('info'), toggle = document.getElementById('toggle');
toggle.onclick = () => (toggle.ariaExpanded = String(info.classList.toggle('open')));

select(new URLSearchParams(location.search).get('bus') ?? FIRST);
