import { XMLParser, XMLValidator } from 'fast-xml-parser';
import Ajv from 'ajv';
import { layout, total } from './derive.js';
import { validate } from './validate.js';
import bus from '../schema/bus-input.schema.json' with { type: 'json' };
import slice from '../schema/netex/vehicle-type.schema.json' with { type: 'json' };

/** Default prefix of the KeyValues B reads. */
export const PREFIX = '3dbus:';
const DECKLESS = ['axles_mm', 'windows_count'];  // VehicleType keys read only when there is no DeckPlan
const ROOT = ['roof_equipment_mm', 'band_above_mm', 'upper_win_band_height_mm', 'band_between_decks_mm', 'win_band_height_mm', 'band_below_grill_mm',
  'band_below_windshield_mm'];
/** The KeyValue suffixes B reads, per element. */
export const KEYS = {
  vehicleType: ['tyre_size', 'tyre_diameter_mm', 'tyre_rear_twin', 'base_color', ...ROOT, ...DECKLESS],
  deck: ['length_mm', 'axles_mm', 'bellows_ahead_mm', 'windows_count'],
  entrance: ['leaves', 'glazed'],
};

const MM_PER_M = 1000, LENGTH_TOL = 10;  // NeTEx LengthType is metres; the Length check's slack, mm
const RIGHT = new Set(['rightSide', undefined]);  // entrance sides that are doors on the drawn side
const LISTS = new Set(['VehicleType', 'DeckPlan', 'VehicleModel', 'Deck', 'DeckLevel', 'PassengerSpace', 'PassengerEntrance', 'KeyValue']);
/** Elements the slice types as numbers: the only tag values parsed as such. */
const NUMS = new Set(Object.values(slice.definitions)
  .flatMap((d) => Object.entries(d.properties ?? {}).filter(([, p]) => p.type === 'number').map(([k]) => k)));
const INT = /^\d+$/;
const READ = {
  int: (v) => (INT.test(v ?? '') ? Number(v) : undefined),
  list: (v) => ((v ?? '').split(',').map((x) => x.trim()).every((x) => INT.test(x)) ? v.split(',').map(Number) : undefined),
  bool: (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
  text: (v) => v || undefined,
};
const EXPECT = { int: 'a whole number', list: 'whole mm, comma-separated', bool: 'true or false', text: 'text' };

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, parseTagValue: false,
  tagValueProcessor: (name, v) => (NUMS.has(name) && Number.isFinite(Number(v)) ? Number(v) : null),
  isArray: (name, _path, _leaf, attr) => !attr && LISTS.has(name),
});
const shape = new Ajv({ allErrors: true, strict: false }).compile(slice);

const mm = (m) => Math.round(m * MM_PER_M);
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const kind = (s) => (s === 'axles_mm' ? 'list' : /_mm$|_count$|^leaves$/.test(s) ? 'int' : /^(glazed|tyre_rear_twin)$/.test(s) ? 'bool' : 'text');

/** An empty element parses to '': drop it from its parent, or make it an empty one in a list. */
const tidy = (n) =>
  Array.isArray(n) ? n.map((x) => (x === '' ? {} : tidy(x)))
  : n && typeof n === 'object' ? Object.fromEntries(Object.entries(n).filter(([, v]) => v !== '').map(([k, v]) => [k, tidy(v)]))
  : n;

/** Every element called `name` anywhere under `n` (//name). */
const all = (n, name) =>
  Array.isArray(n) ? n.flatMap((x) => all(x, name))
  : n && typeof n === 'object' ? Object.entries(n).flatMap(([k, v]) => (k === name ? [v].flat() : all(v, name)))
  : [];

/** A MultilingualString's text: plain, #text beside attributes, or the first Text. */
const text = (n) =>
  typeof n === 'string' ? n
  : n?.['#text'] !== undefined ? String(n['#text'])
  : n?.Text !== undefined ? text([n.Text].flat()[0])
  : undefined;

const named = (tag, n, i) => `${tag} ${n.id ?? `#${i + 1}`}`;

/** A node's prefixed KeyValues read by suffix, each by its kind; errors for the missing and the unreadable. */
const keys = (node, label, prefix, suffixes, required = []) => {
  const kvs = new Map((node.keyList?.KeyValue ?? [])
    .filter((k) => typeof k.Key === 'string' && k.Key.startsWith(prefix)).map((k) => [k.Key.slice(prefix.length), k.Value]));
  const read = suffixes.filter((s) => kvs.has(s)).map((s) => [s, READ[kind(s)](kvs.get(s))]);
  return {
    vals: Object.fromEntries(read.filter(([, v]) => v !== undefined)),
    has: (s) => kvs.has(s),
    errs: [
      ...required.filter((s) => !kvs.has(s)).map((s) => `${label}: ${prefix}${s} is required`),
      ...read.filter(([, v]) => v === undefined).map(([s]) => `${label}: ${prefix}${s} "${kvs.get(s) ?? ''}" must be ${EXPECT[kind(s)]}`),
    ],
  };
};

/** Step 2: the VehicleType, its DeckPlan and VehicleModel, wherever they sit. */
const pick = (doc, id) => {
  const vts = all(doc, 'VehicleType'), ids = vts.map((v) => v.id).join(', ');
  const vt = id === undefined ? vts : vts.filter((v) => v.id === id);
  if (!vts.length) return { errs: ['no VehicleType in the file'] };
  if (!vt.length) return { errs: [`no VehicleType ${id} in the file, which has ${ids}`] };
  if (vt.length > 1) return { errs: [`${vt.length} VehicleTypes in the file (${ids}): pick one by id`] };
  const [type] = vt, plan = type.DeckPlanRef?.ref, model = type.ClassifiedAsRef?.ref;
  const deckPlan = typeof plan === 'string' ? all(doc, 'DeckPlan').find((d) => d.id === plan) : undefined;
  const vehicleModel = typeof model === 'string' ? all(doc, 'VehicleModel').find((m) => m.id === model) : undefined;
  return {
    errs: typeof plan === 'string' && !deckPlan ? [`VehicleType ${type.id}: DeckPlanRef ${plan} has no DeckPlan in the file`] : [],
    warns: typeof model === 'string' && !vehicleModel ? [`VehicleType ${type.id}: ClassifiedAsRef ${model} has no VehicleModel in the file; front.badge_text left out`] : [],
    picked: defined({ VehicleType: type, DeckPlan: deckPlan, VehicleModel: vehicleModel }),
  };
};

/** Step 3: the NeTEx shape, against the slice. */
const shapeErrs = (picked) => (shape(picked) ? [] : shape.errors.map((e) => `${e.instancePath.slice(1) || 'file'} ${e.message}`));

/** The drawn entrances of a Deck, read: right side or no side given. */
const entrances = (deck, prefix) =>
  (deck.deckSpaces?.PassengerSpace ?? []).flatMap((s) => s.deckEntrances?.PassengerEntrance ?? [])
    .filter((e) => RIGHT.has(e.VehicleSide))
    .map((e, i) => {
      const label = named('PassengerEntrance', e, i), k = keys(e, label, prefix, KEYS.entrance, ['leaves']);
      const missing = ['DistanceFromFront', 'Width'].filter((n) => e[n] === undefined).map((n) => `${label}: ${n} is required`);
      return { at: e.DistanceFromFront, width: e.Width, vals: k.vals, errs: [...missing, ...k.errs] };
    });

/**
 * Step 4 for a DeckPlan: per Deck on the first level its keys and entrances; a Deck on the second
 * level adds no section, only says the bus has two decks. Levels count in the order declared, then
 * referenced; a Deck with no DeckLevelRef is on the first.
 */
const readDecks = (deckPlan, prefix) => {
  const ds = deckPlan.decks?.Deck ?? [], ref = (d) => d.DeckLevelRef?.ref;
  const levels = [...new Set([...(deckPlan.deckLevels?.DeckLevel ?? []).map((l) => l.id), ...ds.map(ref)].filter((r) => r !== undefined))];
  const at = ds.map((d, n) => ({ d, n, level: ref(d) === undefined ? 0 : levels.indexOf(ref(d)) }));
  const on = (is) => at.filter(({ level }) => is(level));
  const decks = on((l) => l === 0);
  const over = on((l) => l > 1).map(({ d, n }) => `${named('Deck', d, n)}: DeckLevel ${ref(d)} is a third deck level, which is not supported`);
  const read = decks.map(({ d, n }, i) => {
    const label = named('Deck', d, n), k = keys(d, label, prefix, KEYS.deck, ['length_mm', 'axles_mm', ...(i ? ['bellows_ahead_mm'] : [])]);
    const ents = entrances(d, prefix);
    return {
      label, vals: k.vals, ents,
      errs: [
        ...k.errs,
        ...(!i && k.has('bellows_ahead_mm') ? [`${label}: ${prefix}bellows_ahead_mm is for a Deck behind another`] : []),
        ...ents.flatMap((e) => e.errs),
      ],
    };
  });
  const upper = on((l) => l === 1).map(({ d, n }) => named('Deck', d, n));
  return { read, upper, errs: [...(decks.length ? [] : [`DeckPlan ${deckPlan.id}: no Deck${ds.length ? ' on the first DeckLevel' : ''}`]), ...over, ...read.flatMap((d) => d.errs)] };
};

/** Sections of a DeckPlan, doors placed from the front of their own section. */
const deckSections = (read) => {
  const bare = read.map(({ vals }) => defined({
    length_mm: vals.length_mm, bellows_ahead_mm: vals.bellows_ahead_mm, axles_mm: vals.axles_mm,
    windows_hint: vals.windows_count === undefined ? undefined : { count: vals.windows_count },
  }));
  const at = layout({ sections: bare });
  return bare.map((s, i) => {
    const doors = read[i].ents
      .map((e) => defined({ x_mm: mm(e.at) - at[i].x0, width_mm: mm(e.width), leaves: e.vals.leaves, glazed: e.vals.glazed }))
      .sort((a, b) => a.x_mm - b.x_mm);
    return doors.length ? { ...s, doors } : s;
  });
};

/**
 * Puts the element or KeyValue a value of the input was read from ahead of A's error on it: a
 * section's Deck (or the VehicleType), else the element or key behind a root value.
 */
const blame = ({ decks, label, plan, model, prefix }) => {
  const from = [
    [/^(?:sections\[|\/sections\/)(\d+)/, (m) => decks[Number(m[1])]],
    [/^\/sections\b/, () => plan ?? label],
    [/^\/(width|height)_mm\b/, (m) => `${label}: ${m[1] === 'width' ? 'Width' : 'Height'}`],
    [/^\/front_display\b/, () => `${label}: Name`],
    [/^\/front\b/, () => `${model}: Manufacturer`],
    [/^\/base_color\b/, () => `${label}: ${prefix}base_color`],
    [/^\/tyre\/(size|diameter_mm|rear_twin)\b/, (m) => `${label}: ${prefix}tyre_${m[1]}`],
    [/^\/tyre\b/, () => `${label}: ${prefix}tyre_size or ${prefix}tyre_diameter_mm`],
    [new RegExp(`^/(${ROOT.join('|')})\\b`), (m) => `${label}: ${prefix}${m[1]}`],
    [/^/, () => label],
  ];
  return (e) => {
    const [re, at] = from.find(([r]) => r.test(e));
    return `${at(e.match(re))}: ${e}`;
  };
};

/**
 * Reads a NeTEx VehicleType, with its DeckPlan and VehicleModel when the file has them, into a
 * render input. Steps: parse and pick, check the NeTEx shape, read the KeyValues, build the input
 * and validate it. Within a step every error is collected; a step with errors ends the run.
 * @param {string} xml NeTEx XML: a PublicationDelivery, a frame, or a bare VehicleType
 * @param {{prefix?: string, id?: string}} [opts] prefix of the KeyValues read; id of the
 *   VehicleType, needed when the file has more than one
 * @returns {{ok: true, inp: object, warns: string[]} | {ok: false, errs: string[]}} the input with
 *   warnings, or every error of the failing step, each naming its element or key
 */
export const fromNetex = (xml, { prefix = PREFIX, id } = {}) => {
  const fail = (errs) => ({ ok: false, errs });
  if (typeof xml !== 'string') return fail(['xml: expected a string']);
  const wf = XMLValidator.validate(xml);
  if (wf !== true) return fail([`not XML: ${wf.err.msg} (line ${wf.err.line})`]);
  const doc = tidy(parser.parse(xml));

  const { errs: pickErrs, warns = [], picked } = pick(doc, id);
  if (pickErrs.length) return fail(pickErrs);
  const bad = shapeErrs(picked);
  if (bad.length) return fail(bad);

  const { VehicleType: vt, DeckPlan: plan, VehicleModel: model } = picked, label = `VehicleType ${vt.id}`;
  const k = keys(vt, label, prefix, KEYS.vehicleType.filter((s) => !plan || !DECKLESS.includes(s)), ['base_color', ...(plan ? [] : ['axles_mm'])]);
  const decks = plan ? readDecks(plan, prefix) : { read: [], errs: [] };
  const readErrs = [
    ...['Width', 'Height', ...(plan ? [] : ['Length'])].filter((n) => vt[n] === undefined).map((n) => `${label}: ${n} is required`),
    ...(k.has('tyre_size') || k.has('tyre_diameter_mm') ? [] : [`${label}: ${prefix}tyre_size or ${prefix}tyre_diameter_mm is required`]),
    ...k.errs,
    ...decks.errs,
  ];
  if (readErrs.length) return fail(readErrs);

  const { vals } = k, name = text(vt.Name), maker = text(model?.Manufacturer);
  const inp = {
    schema_version: bus.properties.schema_version.const,
    width_mm: mm(vt.Width), height_mm: mm(vt.Height),
    ...defined(Object.fromEntries(ROOT.map((r) => [r, vals[r]]))),
    ...(name === undefined ? {} : { front_display: name }),
    tyre: defined({ size: vals.tyre_size, diameter_mm: vals.tyre_diameter_mm, rear_twin: vals.tyre_rear_twin }),
    base_color: { hex: vals.base_color },
    ...(maker === undefined ? {} : { front: { badge_text: maker } }),
    sections: plan
      ? deckSections(decks.read)
      : [defined({ length_mm: mm(vt.Length), axles_mm: vals.axles_mm, windows_hint: vals.windows_count === undefined ? undefined : { count: vals.windows_count } })],
  };
  const errs = validate(inp).map(blame({
    decks: plan ? decks.read.map((d) => d.label) : [label], label, prefix,
    plan: plan && named('DeckPlan', plan, 0), model: model && named('VehicleModel', model, 0),
  }));
  if (errs.length) return fail(errs);

  const len = vt.Length === undefined ? undefined : mm(vt.Length), sum = total(inp);
  const long = plan && len !== undefined && Math.abs(len - sum) > LENGTH_TOL ? [`${label}: Length ${len} mm differs from the sections' ${sum} mm`] : [];
  const band = vals.upper_win_band_height_mm !== undefined, key = `${prefix}upper_win_band_height_mm`;
  const levels = !plan || band === decks.upper.length > 0 ? []
    : band ? [`${label}: ${key}, but ${named('DeckPlan', plan, 0)} has no Deck on a second DeckLevel; drawn as two decks`]
    : [`${decks.upper.join(', ')}: on a second DeckLevel, but ${label} has no ${key}; drawn as one deck`];
  return { ok: true, inp, warns: [...warns, ...long, ...levels] };
};
