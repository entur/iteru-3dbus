// The user guide's example host: the library wrapped as one custom element. Not part of the
// package. A host of the published package imports the same names from '@entur/iteru-3dbus'.
import { MM, VIEWS, mapErrs, mkBus, mkStage, mkViews, total, validate } from '../src/index.js';

const TAG = 'bus-3d', FIRST = 'quarter';
const CSS = ':host{display:block}:host([hidden]){display:none}div{width:100%;height:100%;overflow:hidden}canvas{display:block;touch-action:none}';

/** Element base class; a stand-in where there is no DOM, so the module still loads on a server. */
const Base = globalThis.HTMLElement ?? class {};

/** Fires a bubbling event that crosses shadow roots. */
const emit = (e, type, detail) => e.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

/** Moves properties a host set before the element was defined onto the element's accessors. */
const upgrade = (e, props) =>
  props.filter((p) => Object.hasOwn(e, p)).forEach((p) => {
    const v = e[p];
    delete e[p];
    e[p] = v;
  });

/** Errors that stop a rebuild: an invalid input, or face maps that do not fit its sections. */
const check = (inp, maps) => {
  const errs = validate(inp);
  return errs.length ? errs : mapErrs(inp, maps);
};

/**
 * `<bus-3d>`: renders a bus in three.js, filling its own box. It takes the face maps as input and
 * does not care what produced them.
 * - `inp` (property, required): bus input
 * - `faces` (property, required): face maps for that `inp`, as faces() returns them
 * - `view` (attribute and property): camera view, a key of VIEWS
 * - `offset-x` / `offsetX` (attribute and property): horizontal view offset in px
 * - `go(view, instant)`: fly to a view
 * - `busrender` event, `detail: { inp }`; `buserror` event, `detail: { errors }`, which leaves the
 *   last render in place
 *
 * Nothing is drawn until both `inp` and `faces` are set. Setting either schedules one rebuild in
 * a microtask, so setting both in a row rebuilds once. The first rebuild aims at `view`; later
 * ones keep the camera where it is.
 */
export class Bus3d extends Base {
  static observedAttributes = ['view', 'offset-x'];
  #inp = null;
  #faces = null;
  #box = null;
  #stage = null;
  #fly = null;
  #cur = null;
  #len = 0;
  #queued = false;
  #quiet = false;
  #aim = false;  // the first aim is still due: it waits for the box to have a size

  constructor() {
    super();
    this.#box = document.createElement('div');
    this.attachShadow({ mode: 'open' }).append(Object.assign(document.createElement('style'), { textContent: CSS }), this.#box);
  }

  connectedCallback() {
    upgrade(this, ['inp', 'faces', 'view', 'offsetX']);
    this.#stage = mkStage(this.#box);
    this.#stage.offset(this.offsetX);
    this.#stage.fits.push(() => this.#settle());
    this.#fly = mkViews(this.#stage, () => ({ group: this.#cur, len: this.#len }));
    this.#queue();
  }

  disconnectedCallback() {
    this.#cur && this.#stage.drop(this.#cur);
    this.#stage.dispose();
    this.#stage = this.#fly = this.#cur = null;
  }

  attributeChangedCallback(name) {
    if (name === 'offset-x') this.#stage?.offset(this.offsetX);
    else if (!this.#quiet) this.#go();
  }

  get inp() {
    return this.#inp;
  }

  set inp(v) {
    this.#inp = v;
    this.#queue();
  }

  get faces() {
    return this.#faces;
  }

  set faces(v) {
    this.#faces = v;
    this.#queue();
  }

  get view() {
    const v = this.getAttribute('view');
    return Object.hasOwn(VIEWS, v ?? '') ? v : FIRST;
  }

  set view(v) {
    this.setAttribute('view', v);
  }

  get offsetX() {
    return Number(this.getAttribute('offset-x')) || 0;
  }

  set offsetX(v) {
    this.setAttribute('offset-x', v);
  }

  /**
   * Flies the camera to a named view, re-framed for the current bus.
   * @param {string} [view] a key of VIEWS, default: the current view
   * @param {boolean} [instant] jump instead of flying
   */
  go(view = this.view, instant = false) {
    this.#quiet = true;
    this.view = view;
    this.#quiet = false;
    this.#go(instant);
  }

  #go(instant = false) {
    this.#cur && this.#fly(this.view, instant);
  }

  /** Aims at the view once there is both a model and a box to frame it in. */
  #settle() {
    if (!this.#aim || !this.#cur || !this.#box.clientWidth || !this.#box.clientHeight) return;
    this.#aim = false;
    this.#go(true);
  }

  #queue() {
    if (this.#queued || !this.#stage || !this.#inp || !this.#faces) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#build();
    });
  }

  /** Swaps in the model for the current inp and faces, centred on the origin, front towards -x. */
  #build() {
    const inp = this.#inp, maps = this.#faces;
    if (!this.#stage || !inp || !maps) return;
    const errs = check(inp, maps);
    if (errs.length) return emit(this, 'buserror', { errors: errs });
    const next = mkBus(inp, maps);  // before the drop: a build that throws leaves the last render
    this.#aim ||= !this.#cur;
    this.#cur && this.#stage.drop(this.#cur);
    this.#len = total(inp) * MM;
    this.#cur = next;
    this.#cur.position.x = -this.#len / 2;
    this.#stage.add(this.#cur);
    this.#settle();
    emit(this, 'busrender', { inp });
  }
}

globalThis.customElements && !customElements.get(TAG) && customElements.define(TAG, Bus3d);
