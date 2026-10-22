import Ajv from 'ajv/dist/2020.js';
import schema from '../schema/bus-input.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false, formats: { 'uri-reference': true } });
const chk = ajv.compile(schema);

/** Cross-field rules (1) and (4) from the schema's top-level $comment. (5), door overlap, is not checked yet. */
const rules = [
  (inp) =>
    inp.sections.flatMap((s, i) => [
      ...(s.axles_mm.every((a, j, xs) => j === 0 || a > xs[j - 1]) ? [] : [`sections[${i}].axles_mm must ascend`]),
      ...(s.axles_mm.every((a) => a > 0 && a < s.length_mm) ? [] : [`sections[${i}].axles_mm must lie inside the section`]),
    ]),
  (inp) =>
    inp.sections.flatMap((s, i) =>
      (s.doors_hint ?? [])
        .filter((d) => (d.axle_gap ?? 0) >= Math.max(s.axles_mm.length - 1, d.zone === 'between_axles' ? 0 : 1))
        .map((d) => `sections[${i}] has no axle gap ${d.axle_gap ?? 0}`),
    ),
];

/**
 * Validates a bus input against the schema, then the cross-field rules.
 * @param {unknown} inp parsed JSON
 * @returns {string[]} error messages, empty when valid
 */
export const validate = (inp) =>
  chk(inp)
    ? rules.flatMap((r) => r(inp))
    : chk.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
