const BODY = { rigid: 'rigid', articulated: 'articulated', bi_articulated: 'bi-articulated' };

/** Tiny DOM builder: el('td', { className: 'ok' }, 'text', child). */
export const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

/**
 * Fills the header: one button per bus, then title, fleet-number plate and operator line.
 * @param {{id: string, inp: object}[]} buses all selectable buses
 * @param {string} id the selected bus
 * @param {(id: string) => void} pick called when another bus is chosen
 */
export const header = (buses, id, pick) => {
  const { inp } = buses.find((b) => b.id === id);
  document.getElementById('models').replaceChildren(
    ...buses.map((b) =>
      el('button', { onclick: () => pick(b.id), ariaPressed: String(b.id === id) }, `${b.inp.brand} ${b.inp.model.split(' ')[0]}`),
    ),
  );
  const title = `${inp.brand} ${inp.model}`;
  document.getElementById('title').textContent = title;
  document.title = `${title} · 3dbus`;
  const plate = document.getElementById('plate');
  plate.textContent = inp.meta?.fleet_number ?? '';
  plate.hidden = !inp.meta?.fleet_number;
  document.getElementById('sub').textContent = [inp.meta?.operator, `${BODY[inp.body]}, class ${inp.bus_class}`].filter(Boolean).join(' · ');
};
