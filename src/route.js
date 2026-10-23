// The app's two routes in the address bar, under the base the site is served from: /list and /bus?file=.
const LIST_AT = 'list', BUS_AT = 'bus', FILE = 'file';  // path segments and the query key of the file
const OLD = 'bus', ROOT = ['', 'index.html'];  // ?bus=<id> of the old links, read at the base path only
const SET = '#busnordic';  // the old list: a hash, set over whatever ?bus= the address had

/** The list of every bus. */
export const LIST = Object.freeze({ page: 'list' });

/**
 * The route an address names. `/bus` with a file is that bus; the base path with an old `?bus=<id>`
 * is that id's file, unless the old `#busnordic` follows it; anything else, the start included, is the list.
 * @param {{pathname: string, search: string, hash: string}} loc the address, as `location` or a URL
 * @param {string} base the path the app is served from, ending in `/`
 * @param {Map<string, string>} ids file under examples/ by old id (file name without `.xml`)
 * @returns {{page: 'list'} | {page: 'bus', file: string}} the route
 */
export const parse = (loc, base, ids) => {
  const at = loc.pathname.startsWith(base) ? loc.pathname.slice(base.length) : null, q = new URLSearchParams(loc.search);
  const file = at === BUS_AT ? q.get(FILE) : ROOT.includes(at) && loc.hash !== SET ? ids.get(q.get(OLD)) : null;
  return file ? { page: 'bus', file } : LIST;
};

/**
 * The address of a route: path and query, the file's slashes left readable.
 * @param {{page: 'list'} | {page: 'bus', file: string}} r the route
 * @param {string} base the path the app is served from, ending in `/`
 * @returns {string} e.g. `/bus?file=busnordic/bn-i-15-le.xml`
 */
export const href = (r, base) =>
  r.page === 'bus' ? `${base}${BUS_AT}?${FILE}=${encodeURIComponent(r.file).replaceAll('%2F', '/')}` : `${base}${LIST_AT}`;
