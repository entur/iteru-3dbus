import { Base, define, emit, shadow, upgrade } from './elem.js';
import { validate } from './validate.js';
import { faces } from './vector.js';

/** Sides of the bus boxes a face map exists for, with a label each. */
export const FACES = { right: 'Right', left: 'Left', front: 'Front', rear: 'Rear' };

const TAG = 'bus-2d', FIRST = 'right', GAP = 3, END_W = '46%';  // end maps are narrow: drawn at part of the width
const CSS = `:host{display:block}:host([hidden]){display:none}.faces{display:flex;align-items:flex-end;gap:${GAP}px}.faces.front,.faces.rear{width:${END_W}}.face{display:block;min-width:0;height:auto}`;

/** Copy of a face map sized to its share of the row; the map itself stays untouched. */
const shown = (f) => {
  const s = f.svg.cloneNode(true);
  s.style.flex = `${f.w} 1 0`;
  return s;
};

/**
 * `<bus-2d>`: draws the face maps of one side of a bus and hands all of them out as `faces`.
 * SVG only: tabs, labels and numbers are up to the host.
 * - `inp` (property): bus input; set synchronously, so `faces` is current when the setter returns
 * - `face` (attribute and property): which side to show, a key of FACES
 * - `faces` (property, read-only): face maps of the last valid `inp`, null before the first
 * - `busfaces` event, `detail: { faces }`; `buserror` event, `detail: { errors }`, on an invalid
 *   `inp`, which leaves the last maps in place
 */
export class Bus2d extends Base {
  static observedAttributes = ['face'];
  #inp = null;
  #faces = null;
  #view = null;

  constructor() {
    super();
    this.#view = document.createElement('div');
    shadow(this, CSS, this.#view);
  }

  connectedCallback() {
    upgrade(this, ['inp', 'face']);
  }

  attributeChangedCallback() {
    this.#draw();
  }

  get inp() {
    return this.#inp;
  }

  set inp(v) {
    this.#inp = v;
    const errs = validate(v);
    if (errs.length) return emit(this, 'buserror', { errors: errs });
    this.#faces = faces(v);
    this.#draw();
    emit(this, 'busfaces', { faces: this.#faces });
  }

  get faces() {
    return this.#faces;
  }

  get face() {
    const k = this.getAttribute('face');
    return Object.hasOwn(FACES, k ?? '') ? k : FIRST;
  }

  set face(v) {
    this.setAttribute('face', v);
  }

  /** The maps of the shown side, front to rear; on the right side the front points right. */
  #draw() {
    const k = this.face, fs = this.#faces?.[k] ?? [];
    this.#view.className = `faces ${k}`;
    this.#view.replaceChildren(...(k === 'right' ? [...fs].reverse() : fs).map(shown));
  }
}

define(TAG, Bus2d);

export { faces };
