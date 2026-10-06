# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Boxy 3D bus rendered in three.js from one input JSON (`schema/bus-input.schema.json`, contract v2.0).
This is v1: no ML branch (no VLM, no OpenCV). The schema's `photo` field is accepted and ignored.
`docs/flowchart.html` shows the full intended pipeline including the ML branch, for reference only.

Plain ES modules, no TypeScript, no framework, no linter. Vite for the browser app, `node --test` for tests.

## Commands

```sh
npm i
npm run dev                                   # vite; ?bus=<id> picks an example (id = file name without .json)
npm run build
npm test                                      # node --test, picks up test/*.test.js
node --test --test-name-pattern='derives'     # single test by name
npm run validate -- examples/*.json           # schema + cross-field rules, exit 1 on any failure
```

## Architecture

Everything flows from one validated input object (`inp`). Units are **mm** everywhere except inside
three.js, where `MM = 0.001` converts to metres at the last moment.

```
examples/*.json ──▶ validate.js ──▶ derive.js ──┬──▶ vector.js (SVG face maps, mm) ──┬──▶ bus.js (3D, textures)
                                               │                                    └──▶ ui.js (2D card)
                                               └──▶ dims.js (shared fixed proportions)
main.js wires: scene.js (stage) + views.js (camera) + bus.js + ui.js
```

- **`validate.js`** — Ajv (draft 2020-12) against the schema, then the `rules` array for what JSON
  Schema cannot express. The rules are numbered (1)–(5) in the schema's top-level `$comment`;
  (1)–(4) are implemented, (5) (door overlap) waits for door placement. Cross-field rules only run
  when the schema passes. Returns `string[]`, empty when valid.
- **`derive.js`** — pure functions, no DOM, no three: `layout` (per-section `x0`, absolute axle x,
  bellows), `total`, `spans` (overhangs/wheelbases), `tyreDia`. Input axles are section-relative;
  `layout` makes them absolute from the front end. Node-safe, so it is what the tests cover.
- **`dims.js`** — fixed body proportions (clearance, corner radius, arch gap, tyre, roof pod) shared
  by the 2D and 3D sides. Anything both `vector.js` and `bus.js` must agree on lives here.
- **`vector.js`** — `faces(inp)` returns SVG maps per box side (`right`/`left` one per section,
  `front`/`rear` one each), in mm, as seen from outside. This is the **single source** for both the
  3D face textures and the "2D vector map" card: the card must show exactly what is on the model,
  so nothing that is separate geometry (wheels, bellows, roof pod) goes into a face map. New surface
  detail (doors, windows, front/rear templates) belongs here, not as extra meshes in `bus.js`.
- **`bus.js`** — `mkBus(inp)`: per section an extruded side profile with arch cut-outs, liners,
  wheels; bellows between sections; roof pod of `roof_equipment_mm` on a body drawn to
  `height_mm - roof_equipment_mm`. The side profile in `profile()` and the SVG path in
  `vector.js` `side()` describe the same outline and must change together. The extrude geometry's
  groups are re-split so the two caps (right, left) take separate face textures; the SVGs are
  rasterised via data URLs and placed with texture `repeat`/`offset` on metre-valued UVs.
- **`scene.js`** — `mkStage(el)`: renderer, sky/fog, lights, shadows, ground, orbit controls;
  day/night palette from the OS colour scheme. `ticks` are per-frame callbacks; `drop` disposes
  geometry, materials and maps.
- **`views.js`** — named camera views and animated flights between them (registered as a stage tick).
- **`ui.js`** — header and details cards, built with the tiny `el()` DOM builder.
- **`main.js`** — loads every `examples/*.json` through `import.meta.glob`, so any file dropped in
  `examples/` becomes a selectable bus. Selecting validates first and shows errors in `#err`.

### Coordinate conventions

- `mkBus` returns a group with the front end at x = 0 running towards +x, ground at y = 0, z centred;
  `main.js` then shifts it by `-len/2` so the bus is centred with the front towards −x.
- Extrude caps: z = 0 is the right side, z = w the left side.
- Right-side face maps are mirrored (front points right): axle x is flipped in `faces()`, the
  texture uses a negative `repeat.x`, and the card reverses section order for that tab.

### Schema and examples

- `examples/` are the schema's own `examples` (Citaro G has `roof_equipment_mm` added). Tests load
  `volvo-8900` and `citaro-g` by name and assert exact derived numbers, and the reject cases are
  built by patching those two — changing them means updating `test/validate.test.js`.
- The schema is strict (`additionalProperties: false`, `unevaluatedProperties: false` on sections).
- `vite.config.js` sets `assetsInlineLimit: 0` on purpose: the header's source link must point at a
  real `.json` file, not a `data:` URL.

## Not done yet (v1)

Tracked in `README.md`; these are parsed/validated but not drawn:

- Door placement from `doors_hint` (zone, bias, leaves) and the door-overlap rule
- Windows: equal panes in the band, skipping door spans; left side derived, not mirrored
- Default door set per `bus_class`, window band per `floor_type`
- Front template (`front.template`) and rear template; the front map only has the badge
- Two decks for `low_floor_lower_level`; `door_side`

## Conventions in this code

- Tunables live in a named-const block at the top of each file; several related consts per line.
- Pure, expression-style functions and pipelines (`flatMap`/`reduce`), terse names (`inp`, `mk*`, `fmt`, `el`).
- JSDoc on every export with `@param`/`@returns`; one-line `/** */` on non-obvious helpers.
