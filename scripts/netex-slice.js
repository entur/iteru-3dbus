// Usage: node scripts/netex-slice.js <base.schema.json>
// Cuts the NeTEx draft-07 schema down to what the NeTEx adapter reads and writes
// schema/netex/vehicle-type.schema.json. Pruned elements stay open, so a valid file with more in it passes.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../schema/netex/vehicle-type.schema.json', import.meta.url);
const ROOTS = ['VehicleType', 'DeckPlan', 'VehicleModel'];
/** Output definition -> its source definition and the properties kept (a name differs from its source where noted). */
const READ = {
  VehicleType: { src: 'VehicleType', keep: ['id', 'Name', 'Length', 'Width', 'Height', 'keyList', 'DeckPlanRef', 'ClassifiedAsRef'] },
  DeckPlan: { src: 'DeckPlan', keep: ['id', 'decks'] },
  decks: { src: 'decks_RelStructure', keep: ['Deck'] },
  Deck: { src: 'Deck', keep: ['id', 'keyList', 'DeckLevelRef', 'deckSpaces'] },
  deckSpaces: { src: 'deckSpaces_RelStructure', keep: ['DeckSpace_Dummy'] },
  PassengerSpace: { src: 'PassengerSpace', keep: ['deckEntrances'] },
  deckEntrances: { src: 'deckEntrances_RelStructure', keep: ['DeckEntrance_Dummy'] },
  PassengerEntrance: { src: 'PassengerEntrance', keep: ['DistanceFromFront', 'Width', 'VehicleSide', 'keyList'] },
  VehicleModel: { src: 'VehicleModel', keep: ['id', 'Name', 'Manufacturer'] },
  keyList: { src: 'KeyListStructure', keep: ['KeyValue'] },
  KeyValue: { src: 'KeyValueStructure', keep: ['Key', 'Value'] },
  DeckPlanRef: { src: 'DeckPlanRef', keep: ['ref', 'version'] },
  DeckLevelRef: { src: 'DeckLevelRef', keep: ['ref', 'version'] },
  ClassifiedAsRef: { src: 'VehicleModelRefStructure', keep: ['ref', 'version'] },
  MultilingualString: { src: 'MultilingualString', keep: ['lang'] },
};

const refName = (r) => r.slice('#/definitions/'.length);
const ref = (n) => ({ $ref: `#/definitions/${n}` });

/**
 * Cuts the schema down to the definitions B reads, with the upstream gaps patched.
 * @param {object} base the NeTEx base.schema.json, parsed
 * @returns {object} the draft-07 slice
 */
export function slice(base) {
  const src = base.definitions;
  const outOf = Object.fromEntries(Object.entries(READ).map(([out, { src: s }]) => [s, out]));

  /** The properties of a definition with its allOf / $ref chain flattened. */
  const props = (n) => (n.$ref ? props(src[refName(n.$ref)])
    : { ...(n.allOf ?? []).reduce((acc, a) => ({ ...acc, ...props(a) }), {}), ...(n.properties ?? {}) });

  /** A property: a $ref to a kept definition, else its primitive (type, enum), else open. */
  const shape = (n) => {
    const hop = n.$ref ?? n.allOf?.[0]?.$ref;
    if (hop && outOf[refName(hop)]) return ref(outOf[refName(hop)]);
    if (hop) return shape(src[refName(hop)]);
    if (n.type === 'array') return { type: 'array', items: shape(n.items ?? {}) };
    return n.type && n.type !== 'object' ? { type: n.type, ...(n.enum && { enum: n.enum }) } : {};
  };

  const definitions = Object.fromEntries(Object.entries(READ).map(([out, { src: s, keep }]) => {
    const all = props(src[s]);
    return [out, { type: 'object', properties: Object.fromEntries(keep.filter((k) => all[k]).map((k) => [k, shape(all[k])])) }];
  }));

  const patched = [fix52Arrays, fix16Members, fix19Mixed, fix18Required].reduce((d, fix) => fix(d), definitions);
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    required: ['VehicleType'],
    properties: Object.fromEntries(ROOTS.map((r) => [r, ref(r)])),
    definitions: patched,
  };
}

/** netex-typescript-model#52: a repeated xsd:choice is collapsed to a scalar, so the relation lists hold one entry. The members B reads become arrays. */
const fix52Arrays = (d) => ({
  ...d,
  deckSpaces: { ...d.deckSpaces, properties: { DeckSpace_Dummy: { type: 'array', items: d.deckSpaces.properties.DeckSpace_Dummy } } },
  deckEntrances: { ...d.deckEntrances, properties: { DeckEntrance_Dummy: { type: 'array', items: d.deckEntrances.properties.DeckEntrance_Dummy } } },
});

/** netex-typescript-model#16: substitution-group members are not named, so the lists name DeckSpace_Dummy / DeckEntrance_Dummy. They get PassengerSpace / PassengerEntrance as properties. */
const fix16Members = (d) => ({
  ...d,
  deckSpaces: { ...d.deckSpaces, properties: { PassengerSpace: { type: 'array', items: ref('PassengerSpace') } } },
  deckEntrances: { ...d.deckEntrances, properties: { PassengerEntrance: { type: 'array', items: ref('PassengerEntrance') } } },
});

/** netex-typescript-model#19: mixed content is not modelled; a MultilingualString is an object only. It may be plain text too. */
const fix19Mixed = (d) => ({ ...d, MultilingualString: { anyOf: [{ type: 'string' }, d.MultilingualString] } });

/** netex-typescript-model#18: required attributes are optional upstream. B needs id on the three roots and ref on the two refs it follows. */
const fix18Required = (d) => ({
  ...d,
  ...Object.fromEntries([['VehicleType', 'id'], ['DeckPlan', 'id'], ['VehicleModel', 'id'], ['DeckPlanRef', 'ref'], ['ClassifiedAsRef', 'ref']]
    .map(([n, k]) => [n, { ...d[n], required: [k] }])),
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = slice(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
}
