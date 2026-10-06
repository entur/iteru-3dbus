/** Element base class; a stand-in where there is no DOM, so the modules still load on a server. */
export const Base = globalThis.HTMLElement ?? class {};

/**
 * Registers a custom element once; does nothing where there is no DOM.
 * @param {string} tag element name
 * @param {CustomElementConstructor} cls its class
 */
export const define = (tag, cls) => {
  globalThis.customElements && !customElements.get(tag) && customElements.define(tag, cls);
};

/**
 * Opens a shadow root holding a stylesheet and the given nodes.
 * @param {HTMLElement} e host element
 * @param {string} css rules for the shadow root
 * @param {...Node} kids content
 * @returns {ShadowRoot}
 */
export const shadow = (e, css, ...kids) => {
  const root = e.attachShadow({ mode: 'open' });
  root.append(Object.assign(document.createElement('style'), { textContent: css }), ...kids);
  return root;
};

/**
 * Fires a bubbling event that crosses shadow roots.
 * @param {HTMLElement} e element to fire on
 * @param {string} type event name
 * @param {object} detail event detail
 */
export const emit = (e, type, detail) => {
  e.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
};

/**
 * Moves properties a host set before the element was defined onto the element's accessors.
 * @param {HTMLElement} e element being connected
 * @param {string[]} props accessor names
 */
export const upgrade = (e, props) =>
  props.filter((p) => Object.hasOwn(e, p)).forEach((p) => {
    const v = e[p];
    delete e[p];
    e[p] = v;
  });
