# Render input and NeTEx adapter (schema 3.0)

Spec for [#40](https://github.com/entur/iteru-3dbus/issues/40). Line refs as of `5363600`.

## Intent

The library's input should hold only what is drawn. Domain data (brand, model, class, floor type)
matters for the vehicle, but it doesn't say what goes on the grille or the destination display.
So there are two layers:

- **A, render input:** `inp`, schema 3.0. Every value turns into geometry or texture. Each drawn
  thing has one prop, and no prop falls back to another.
- **B, adapter:** `fromNetex(xml, opts) → inp`. It reads a NeTEx VehicleType (and its DeckPlan),
  decides what is drawn, and writes A.

The examples move to NeTEx XML, and the app loads them through B. Every bus in the header and the
gallery then exercises B.

## Goals

- Schema 3.0 as #40 lists it: the domain fields, the class and floor rules, and rules (2) and (3)
  are removed; `signed()` and the fallbacks are removed.
- A gains **absolute doors** per section, with `doors_hint` kept as the input for producers that
  only know roughly where a door is.
- B: `fromNetex` in the core layer (pure, Node-safe, no DOM), shipped as a package entry.
- All 19 examples (`examples/*.json`, `examples/busnordic/*.json`) become `.xml` files, and the
  JSON files are deleted.
- The app, the tests and `npm run validate` read the XML through B.
- One rule for every check: it's either an **error** (A can't draw it), a **warning** (B's data
  disagrees with itself, drawn anyway) or a **limit** (regulation). Limits apply only when the
  app's "Nordic-limited | fantasy-bus" flag is on Nordic-limited. See [Checks](#checks).

## Non-goals

- Producing NeTEx from A (`toNetex`). The app's "Modified" download stays A JSON (`toJson`).
- Double deck (#9). B only leaves room for it; see [Later](#later).
- Absolute window panes (`DeckWindow`). Windows stay `windows_hint.count`.
- Left-side entrances, which wait for #10. `Vehicle` (as opposed to VehicleType) input.
- Full XSD validation. It needs WebAssembly in the browser, and a schema of several MB.
- Changing mui-comps-nmr's `toBusInput`. It keeps producing A from sobek's GraphQL; whether it
  later calls `fromNetex` is its own issue.

## Anti-goals

- B inventing values. A required A value with no source in the XML is an error, not a default,
  as in `toBusInput` (mui-comps-nmr `src/BusInput/toBusInput.ts:6`).
- A carrying domain data again, under any name.
- The browser bundle growing by a WebAssembly validator or a DOM polyfill.

## A: schema 3.0

As #40 lists it. In short, `schema_version` is `3.0` and the root holds: `width_mm`, `height_mm`,
`roof_equipment_mm`, the four bands, `front_display`, `tyre`, `base_color.hex`,
`front.badge_text` and `sections`. A missing `front.badge_text` means no badge text, and a missing
`front_display` means no display.

### Absolute doors

Each section takes either `doors` or `doors_hint`, never both. The schema rejects a section
that has both, so it's always clear which one is drawn.

```json
"doors": [{ "x_mm": 600, "width_mm": 1250, "leaves": 2, "glazed": true }]
```

| field | | meaning |
| --- | --- | --- |
| `x_mm` | required, integer ≥ 0 | forward edge of the door, from the front of the section (like `axles_mm`) |
| `width_mm` | required, 600–1600 | as `door_hint.width_mm` |
| `leaves` | required, 1 or 2 | as `door_hint.leaves` |
| `glazed` | default `true` | as `door_hint.glazed` |
| | maxItems 4 | as `doors_hint` |

- `derive.js` `doors()` (`src/derive.js:112`) returns `{ x0, x1, leaves, glazed }` per door in
  both cases. With `doors`, that's `x0 = x_mm` and `x1 = x_mm + width_mm`, without placement.
  `vector.js` and the window runs don't change.
- New cross-field rule: an absolute door lies inside its section and clear of the wheel arches
  (`arch`). It's an error, not clamped. Rule (5), door overlap, covers both kinds once it's built;
  this spec builds it for absolute doors at least.
- `edit.js`: a `DOOR_AT` row set for absolute doors (all editable), next to `DOOR`. `addDoor` on a
  section with `doors` adds an absolute door where the hint placement would put a two-leaf door
  in the zone with the fewest doors. `test/edit.test.js` is updated for the new editable rows.

### Removed with #40

Rules (2) and (3) in `src/validate.js:17-23` (they move into `limits`, see [Checks](#checks)), the
`allOf` class and floor rules, `signed()`
(`src/edit.js:208-212`) and its calls, and the `brand` fallback (`src/vector.js:137`). The
schema's `examples` become the stripped A form of `volvo-8900` and `citaro-g`.

## B: `fromNetex`

```js
fromNetex(xml, { prefix = '3dbus:', id } = {})
  → { ok: true, inp, warns: string[] } | { ok: false, errs: string[] }
```

- `xml`: a string. `id`: which VehicleType, needed only when the file has more than one.
- `prefix`: the key prefix of the KeyValues B reads. The caller picks it, and B fixes the suffixes
  (tables below).
- New module `src/netex.js`, core layer. Package entry `./netex`, also re-exported from `.`.
  `test/lib.test.js` gets the layer: core imports only, no DOM, no three.

### Steps

1. **Parse** with `fast-xml-parser` (new dependency; it runs the same in the browser and in
   Node). Namespace prefixes are stripped.
2. **Pick** `VehicleType` and `DeckPlan` wherever they sit (`//VehicleType`): under a
   `PublicationDelivery`, a `ResourceFrame`, a `CompositeFrame`, or with no wrapper. The
   VehicleType is required. The DeckPlan is optional and found by the VehicleType's `DeckPlanRef`
   (`netex_vehicleType_version.xsd:183`). A `DeckPlanRef` with no matching `DeckPlan` in the file
   is an error. The VehicleModel is found by `ClassifiedAsRef` and is optional.
3. **Check the NeTEx shape** with Ajv against `schema/netex/vehicle-type.schema.json`, a slice of
   netex-typescript-model's generated JSON Schema (`generated-src/base`). The slice holds the
   definitions reachable from `VehicleType`, `DeckPlan` and `VehicleModel`, pruned to the
   elements B reads. A pruned element is kept as an open schema (`{}`), so a valid NeTEx file with
   more in it still passes. `scripts/netex-slice.js <generated schema>` writes the slice, and the
   slice is committed.
4. **Read the KeyValues**: present where required, numeric where the suffix ends in `_mm`.
   The slice script then applies the **post-fixes** below.
5. **Build A** and run A's `validate`. Errors from every step come back in one `string[]`,
   each naming the element or key, like `validate`'s errors.

### Post-fixes to the slice

netex-typescript-model's generated schema has gaps, tracked in its epic
[#53](https://github.com/entur/netex-typescript-model/issues/53). We don't fix them upstream in
this work. `scripts/netex-slice.js` patches the slice after cutting it, one named function per
gap, each with a comment naming the upstream issue, so a fix can be dropped once that issue
lands. These are the gaps on B's path, checked against `generated-src/base/base.schema.json`:

| gap | upstream | effect on B | post-fix |
| --- | --- | --- | --- |
| Repeated `xsd:choice` collapsed to a scalar | #52 | `deckSpaces_RelStructure` and `deckEntrances_RelStructure` hold one space and one entrance, so a Deck with two doors can't be described | make the members B reads arrays |
| Substitution-group members not named | #16 | those two lists, and `vehicleTypesInFrame_RelStructure`, name the abstract head (`DeckSpace_Dummy`, `DeckEntrance_Dummy`, `TransportType_Dummy`). The parsed XML says `PassengerSpace` / `PassengerEntrance`, which the schema doesn't name, so the entrances pass **unchecked** | add the concrete members B reads (`PassengerSpace`, `PassengerEntrance`) as their own properties |
| Mixed content not modelled | #19 | `MultilingualString` is `type: object`, so plain text `<Name>8900</Name>` (valid NeTEx, parsed to a string) **fails** | `anyOf: [string, the object]` |
| Required attributes optional | #18 | B matches by `id` and `ref`, but the schema doesn't require them | require `id` on `VehicleType`, `DeckPlan`, `VehicleModel`, and `ref` on `DeckPlanRef` and `ClassifiedAsRef` |

Not on B's path, so no post-fix: #55 (bounds), #17 (`xsd:any`; the schema has no
`additionalProperties: false`, so it's open already), #54, #56. The commit
`xatellite/netex-typescript-model@5a9cebe` on the fork branch named in #52 covers the first gap.
The fixes stay ours until it's merged.

Apart from the gaps, the parsed objects need `fast-xml-parser` options that line up with the
schema: `isArray` for the lists the schema types as arrays (`KeyValue`, `Deck`, the entrances), and
no number parsing of `KeyValue` `Value` (the schema types it as a string; `4700` would come back
a number).

NeTEx `LengthType` is in metres. B turns each one into integer mm (`Math.round(m * 1000)`), and
that's the only unit conversion.

### Mapping: NeTEx elements

| A | from |
| --- | --- |
| `width_mm`, `height_mm` | VehicleType `Width`, `Height` (required) |
| `front.badge_text` | VehicleModel `Manufacturer`, left out when missing |
| `front_display` | VehicleType `Name`, left out when missing |
| `sections[]` | one per `Deck` in the DeckPlan, in document order |
| `sections[].doors` | each `PassengerEntrance` under the Deck's `deckSpaces` with `VehicleSide` `rightSide` or missing: `x_mm` = `DistanceFromFront` − the section's `x0` (from `layout`), `width_mm` = `Width` |
| check | VehicleType `Length`, when present, = sum of section lengths and bellows, ±10 mm, else a **warning**. It isn't drawn, so it's not required |

Without a DeckPlan there's one section with `length_mm` = `Length` (required in that case), axles
and window count from the VehicleType's keys, and no doors.

B never invents a value. Whatever it leaves out takes A's own defaults: the schema `default`s and
`derive.js`. A Deck without entrances gives a section without doors, and B emits no
`doors_hint` (it has no door-count key).

### Mapping: KeyValues (`prefix` + suffix)

On the **VehicleType**:

| suffix | A |
| --- | --- |
| `tyre_size`, `tyre_diameter_mm`, `tyre_rear_twin` | `tyre.size`, `tyre.diameter_mm`, `tyre.rear_twin` (one of the first two is required) |
| `base_color` | `base_color.hex` (required) |
| `roof_equipment_mm` | `roof_equipment_mm` |
| `band_above_mm`, `win_band_height_mm`, `band_below_grill_mm`, `band_below_windshield_mm` | the same root values |
| `axles_mm`, `windows_count` | without a DeckPlan only: the one section's `axles_mm`, `windows_hint.count` |

On each **Deck**:

| suffix | A |
| --- | --- |
| `length_mm` | `length_mm` (required) |
| `axles_mm` | `axles_mm`, comma-separated, section-local (required) |
| `bellows_ahead_mm` | `bellows_ahead_mm` (required on every Deck but the first) |
| `windows_count` | `windows_hint.count` |

On each **PassengerEntrance**:

| suffix | A |
| --- | --- |
| `leaves` | `leaves` (required: NeTEx has no leaf count) |
| `glazed` | `glazed` (`true` / `false`) |

## Checks

Every check we have, sorted into three kinds:

| kind | what | effect | where |
| --- | --- | --- | --- |
| **Error:** A can't draw it | schema types and render bounds; rule (1) axles ascend and lie inside the section; rule (4) axle gap; absolute door inside its section and clear of the arches; rule (5) door overlap | not drawn; the app keeps the last valid bus on screen and marks the edit | A, `validate` |
| **Warning:** the data disagrees with itself | B: `Length` ≠ the sections' sum (±10 mm); more as they turn up | drawn; the app shows the warnings in `#err`'s style, not as errors | B, `warns` |
| **Limit:** regulation | see below | with the flag on Nordic-limited: an error; on fantasy-bus: not run | new pure `src/limits.js`, `limits(inp) → string[]`, core layer, package entry `./limits` |

### Render bounds instead of regulation in the schema

The schema's numeric bounds that are really regulations leave it: `width_mm` ≤ 2550,
`length_mm` ≤ 15000, and the class rules (with #40). A keeps bounds only where the renderer needs
them: a size the model and the face maps can be drawn at, wide enough for a fantasy bus.
The exact numbers are left to the builder (for example width 1500–4000, height 1500–6000, section
length 1000–30000). `sections` stays at 1–3, because the renderer handles three. Bands that don't
fit their body are clamped by `derive.js`, as today.

### Nordic limits

From the Bus Nordic 2.0 tables, the same source as `examples/busnordic/`. A carries no class, so
the limits are written on geometry only:

| limit | from |
| --- | --- |
| width ≤ 2550 | today's `width_mm` maximum |
| total length: one section with 2 axles ≤ 13 500, one with 3 axles ≤ 15 000, two sections ≤ 18 750, three ≤ 24 000 | the tables' length bands (13.5, 15, 18.75, 18.75+) |
| height ≤ 4400 | today's `height_mm` maximum; the tables' double-deckers reach 4250 |
| total length > 9500 → at least two doors, counting `doors` and `doors_hint` | today's rule (3), Bus Nordic 7.2 |

The builder checks these numbers against the Bus Nordic 2.0 document and corrects them where
it says otherwise. All 17 Bus Nordic examples and the two others must pass. Class-only limits
(class A/B ≤ 9.5 m) are dropped with the class.

### The flag

- A switch in the app header: "Nordic-limited | fantasy-bus". It starts on Nordic-limited and is
  remembered per viewer in `localStorage` (my call).
- Nordic-limited: `errs` = `validate` + `limits`, so a draft over a limit is marked and the last
  legal bus stays on screen, as with any error. Fantasy-bus: `errs` = `validate` alone.
- Switching back to Nordic-limited with a draft over a limit marks the draft. The bus on screen
  stays until an edit makes the draft legal again.
- An example that breaks a limit is refused as an invalid example is today.
- The library never applies the flag. A host calls `limits` itself when it wants them.

## Examples to XML

- **One-off conversion:** a script maps each `examples/**/*.json` to `examples/**/*.xml` and is
  not committed. Each file is a `PublicationDelivery` with one `ResourceFrame` holding
  `vehicleModels`, `vehicleTypes` and `deckPlans`, with ids `ITR:VehicleType:<file name>` (and
  the same pattern for the others).
- **What moves where:**
  - `brand` → VehicleModel `Manufacturer`; `model` → VehicleType `Name` and VehicleModel `Name`.
  - The total length → `Length`. Sections → Decks. Everything else → the keys above.
  - `bus_class`, `floor_type`, `body`, `meta`, `photo`, `front.template` and `base_color.name` are
    dropped. The file name already encodes class, length and floor for the Bus Nordic set.
- **Doors become absolute.** The script runs today's `doors()` on the JSON and writes each span as
  a `PassengerEntrance` with `DistanceFromFront` (section `x0` + span `x0`, in metres) and `Width`.
  The drawn doors stay exactly where they are now.
- **Acceptance check:** for every example, `faces(fromNetex(xml).inp)` equals
  `faces(<the old JSON, stripped to A>)`, run once before the JSON is deleted.

## App, tests, CLI

- **`main.js`:** `import.meta.glob('../examples/**/*.xml', { query: '?raw' })`, then
  `fromNetex`. A file that B rejects is listed with its errors in `#err`, as an invalid bus is
  today. Original links to the `.xml`. Set order and labels come from the file name, as #40 says
  (`SETS.order` keys on the `bn-<class>-` prefix).
- **Tests:**
  - `test/netex.test.js`: every example passes.
  - `volvo-8900` and `citaro-g` deep-equal an A object written in the test.
  - Reject cases, built by patching the XML string of those two: no VehicleType, missing
    `Width`, missing `length_mm` key, non-numeric `_mm` key, a different `prefix`, a dangling
    `DeckPlanRef`, a door across an arch. A `Length` mismatch comes back `ok` with one warning.
  - `test/limits.test.js`: each limit at its edge, every example passes, and a fantasy-sized bus
    passes `validate` but not `limits`.
  - `test/validate.test.js` and the other tests that load an example by name go through a helper
    that calls `fromNetex`.
- **`npm run validate`:** takes `.xml` (through B) and `.json` (A directly), by extension.
- **Docs:** `CLAUDE.md` and `README.md` (entries, the two layers, the key table); version bump
  for the release (#37).

## Later

- **Double deck (#9):** sections are Decks on the first `DeckLevel` of the DeckPlan, or Decks with
  no `DeckLevelRef`. A Deck on a second `DeckLevel` will set the upper band once #9 settles its A
  fields. Until then, B reports such a Deck as not supported.
- `DeckWindow` → absolute panes, left-side entrances (#10), `toNetex`.

## Order

Five steps, each with its tests passing: schema 3.0 (#40), then limits and render bounds with
the flag, then absolute doors in A, then B, then the examples to XML with the app switched over.

## Left to the builder

- The slice script's pruning, and any normalising between `fast-xml-parser`'s object layout
  (attributes, text nodes, lists of one) and the layout netex-typescript-model's JSON Schema
  expects. If they don't line up, a thin normalising step before Ajv is fine.
- Error wording, as long as each error names its element or key.
- How the conversion script is written.
