import { readFileSync, readdirSync } from 'node:fs';
import { fromNetex } from '../src/netex.js';

const EX = new URL('../examples/', import.meta.url), XML = /\.xml$/;

/** fromNetex on one example; throws with its errors when it rejects the file. */
const read = (name) => {
  const r = fromNetex(readFileSync(new URL(`${name}.xml`, EX), 'utf8'));
  if (!r.ok) throw new Error(`examples/${name}.xml: ${r.errs.join('; ')}`);
  return r;
};

/**
 * The render input of an example, read through fromNetex.
 * @param {string} name the file name under examples/ without `.xml`, e.g. `volvo-8900` or `busnordic/bn-i-15-le`
 * @returns {object} the input
 * @throws {Error} when fromNetex rejects the file, with its errors
 */
export const load = (name) => read(name).inp;

/**
 * Every example, read through fromNetex: those directly in examples/, then each set's.
 * @returns {{id: string, set: string | undefined, inp: object, warns: string[]}[]} id: the file name
 *   without `.xml`; set: the directory under examples/; warns: what fromNetex warned of
 * @throws {Error} when fromNetex rejects a file, with its errors
 */
export const all = () =>
  [undefined, ...readdirSync(EX, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)].flatMap((set) =>
    readdirSync(new URL(set ? `${set}/` : '.', EX)).filter((f) => XML.test(f)).sort().map((f) => {
      const id = f.replace(XML, ''), { inp, warns } = read(set ? `${set}/${id}` : id);
      return { id, set, inp, warns };
    }),
  );
