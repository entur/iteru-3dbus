# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Boxy 3D bus rendered in three.js from one input JSON (`schema/bus-input.schema.json`, contract v2.0).
This is v1: no ML branch (no VLM, no OpenCV). The schema's `photo` field is accepted and ignored.
`docs/flowchart.html` shows the full intended pipeline including the ML branch, for reference only.

Plain ES modules, no TypeScript, no framework, no linter. Vite for the browser app, `node --test` for tests.
The renderer is two custom elements, `<bus-2d>` and `<bus-3d>`; the app in `main.js` / `ui.js` is one host of them.

## Commands

```sh
npm i
npm run dev                                   # vite; ?bus=<id> picks an example (id = file name without .json)
npm run build
npm run build:lib                             # the elements as ES modules in dist-lib/, three and ajv external
npm test                                      # node --test, picks up test/*.test.js
node --test --test-name-pattern='derives'     # single test by name
npm run validate -- examples/*.json           # schema + cross-field rules, exit 1 on any failure
```

## Architecture

Everything flows from one validated input object (`inp`). Units are **mm** everywhere except inside
three.js, where `MM = 0.001` (`dims.js`) converts to metres at the last moment.

```
core   validate.js  derive.js  dims.js                  pure, no DOM, no three
2D     vector.js  bus-2d.js   <bus-2d>                  core only: no three
3D     bus.js  scene.js  views.js  bus-3d.js  <bus-3d>  core + three: no vector.js, no bus-2d.js
app    main.js  ui.js  edit.js  index.html  style.css   imports the library, never the reverse
```

The host connects the two elements: `map.inp = inp; bus.faces = map.faces; bus.inp = inp`. The 3D
side takes the face maps as input and never imports what produced them; `test/lib.test.js` scans
the imports and fails when a layer reaches the wrong way. Tabs, caption, view bar, header and
cards are host chrome, not part of either element.

- **`validate.js`** — Ajv (draft 2020-12) against the schema, then the `rules` array for what JSON
  Schema cannot express. The rules are numbered (1)–(5) in the schema's top-level `$comment`;
  (1)–(4) are implemented, (5) (door overlap) is not checked yet. Cross-field rules only run
  when the schema passes. Returns `string[]`, empty when valid.
- **`derive.js`** — pure functions, no DOM, no three: `layout` (per-section `x0`, absolute axle x,
  bellows), `total`, `spans` (overhangs/wheelbases), `tyreDia`, `bodyTop`, `hints`, `arch` (the
  wheel-arch circle the model cuts out), `doors` (every hint placed as a span per section:
  the zone gives a span clear of body ends and arches, the bias a position in it), `lintel` (the
  line doors and side windows reach up to: the body top less `band_above_mm`), `sill` (the line
  side windows reach down to: `win_band_height_mm` below `lintel`, never below the skirt; both
  are root values of the input for the whole bus, their defaults read from the schema), `windows`
  (per section equal panes, a pillar between each two, in the runs its doors leave, straight
  across the wheel arches; `windows_hint.count` fixes how many). Input axles are
  section-relative; `layout` gives both `axles` (absolute from the front end) and `local`.
  Node-safe, so it is what the tests cover.
- **`dims.js`** — fixed body proportions (clearance, corner radius, arch gap, tyre, roof pod) shared
  by the 2D and 3D sides. Anything both `vector.js` and `bus.js` must agree on lives here.
- **`vector.js`** — `faces(inp)` returns SVG maps per box side (`right`/`left` one per section,
  `front`/`rear` one each), in mm, as seen from outside. This is the **single source** for both the
  3D face textures and the `<bus-2d>` element: it shows exactly what is projected onto the model,
  so nothing that is separate geometry (wheels, bellows, roof pod) goes into a face map, and
  nothing the model cuts out of a box either: a side map has no wheel arches. New surface
  detail (front/rear templates) belongs here, not as extra meshes in `bus.js`. The doors and
  window panes from `derive.js` `doors` / `windows` are drawn on the right side only, mirrored by
  `flip`: the panes from `sill` up to `lintel`, the doors from their own sill up to `lintel`,
  both in the same frame (`framed`: one colour, width and corner radius).
  `test/vector.test.js` runs `faces` against a stand-in `document`.
- **`bus.js`** — `mkBus(inp, maps)`: per section an extruded side profile with arch cut-outs, liners,
  wheels; bellows between sections; roof pod of `roof_equipment_mm` on a body drawn to
  `height_mm - roof_equipment_mm`. The side profile in `profile()` and the SVG path in
  `vector.js` `side()` share the box outline (skirt, roof, corners) and must change together; the
  arch cut-outs are in `profile()` alone, the map runs on under them. The extrude geometry's
  groups are re-split so the two caps (right, left) take separate face textures; the SVGs are
  rasterised via data URLs and placed with texture `repeat`/`offset` on metre-valued UVs. Face
  maps are read-only for consumers: `tex` rasterises a clone.
- **`scene.js`** — `mkStage(el)`: renderer, sky/fog, lights, shadows, ground, orbit controls;
  day/night palette from the OS colour scheme. The canvas follows `el` through a `ResizeObserver`.
  `ticks` are per-frame callbacks, `fits` per-resize ones; `drop` disposes geometry, materials and
  maps of a model, `dispose` the stage itself.
- **`views.js`** — `VIEWS` and animated flights between them (registered as a stage tick). No buttons.
- **`elem.js`** — what both elements share: `define`, `shadow`, `emit`, `upgrade`, and a `Base`
  class that lets the modules load where there is no DOM.
- **`bus-2d.js`** — `<bus-2d>`: `inp` in, `faces` out (synchronously), shows the side named by
  `face`. It shows clones, so the maps it hands out stay detached and untouched.
- **`bus-3d.js`** — `<bus-3d>`: needs both `inp` and `faces`; setting either queues one rebuild in
  a microtask. The first rebuild aims at `view`, later ones keep the camera, so a host that wants
  a re-aim calls `go()` on `busrender`. An invalid `inp`, or maps that do not fit its sections,
  fire `buserror` and leave the last render. Disconnecting disposes the stage; reconnecting rebuilds.
- **`core.js`**, **`index.js`** — package entries (`./core`, `.`), next to `./bus-2d` and `./bus-3d`.
- **`edit.js`** — pure, node-safe: `FIELDS` / `SECTION` list every schema value as a row (group,
  path, label) and mark the editable ones, which are the values the renderer draws plus `brand`.
  The total length is the one derived row that is editable: `to` names the input value its edits
  land on (the first section's length) and `shifted` gives the value to write there.
  `DOOR` lists the values of one door hint the same way, all editable. `windows_hint.count` is
  a row of `SECTION`, with the panes drawn by default as its hint.
  `get` / `set` work on key-array paths and never mutate; `addAxle` / `rmAxle`; `addDoor` (two
  leaves, in the zone holding the fewest doors) / `rmDoor` (by index; the last one takes the
  `doors_hint` key with it); `spec` and `axleLim` read limits and defaults from the schema, `spec`
  also down into a section's lists and its windows hint.
  `test/edit.test.js` fails when a schema value has no row, or
  when the editable set changes: making a field editable is deliberate.
- **`ui.js`** — header, view bar, map card and the input card (`form`): one accordion group per
  part of the schema. `el()` binds a function prop or child as a signal effect; `scoped` collects
  those effects so a form is disposed as one. The form is built once per selected bus and its
  controls follow the signals, so focus survives an edit; only a section's axle inputs and its
  door blocks are rebuilt, when their count changes. Enum values are `<select>`s (`kind: 'enum'`).
- **`main.js`** — loads every `examples/*.json` through `import.meta.glob`, so any file dropped in
  `examples/` becomes a selectable bus. Selecting validates first and shows errors in `#err`. Owns
  what is app layout: the view offset that keeps the bus clear of the details panel.
  State is `@preact/signals-core` (app only, banned from the library by `test/lib.test.js`):
  `src` the example as loaded, `draft` with every edit, `ok` the last valid draft. Everything
  drawn (model, maps, header, derived rows) reads `ok`; the controls read `draft`, so an invalid
  edit stays in its field, marked, while the last valid bus stays on screen. Only another bus
  re-aims the camera. The source link warns through `<dialog id="drift">` once `draft` differs
  from `src`.

### Coordinate conventions

- `mkBus` returns a group with the front end at x = 0 running towards +x, ground at y = 0, z centred;
  `bus-3d.js` then shifts it by `-len/2` so the bus is centred with the front towards −x.
- Extrude caps: z = 0 is the right side, z = w the left side.
- Right-side face maps are mirrored (front points right): `faces()` flips the spans it draws, the
  texture uses a negative `repeat.x`, and `<bus-2d>` reverses section order for that side.

### Schema and examples

- `examples/` are the schema's own `examples` (Citaro G has `roof_equipment_mm` added). Tests load
  `volvo-8900` and `citaro-g` by name and assert exact derived numbers, and the reject cases are
  built by patching those two — changing them means updating `test/validate.test.js`.
- The schema is strict (`additionalProperties: false`, `unevaluatedProperties: false` on sections).
- `vite.config.js` sets `assetsInlineLimit: 0` on purpose: the header's source link must point at a
  real `.json` file, not a `data:` URL.

## Not done yet (v1)

Tracked in `README.md`; these are parsed/validated but not drawn:

- The door-overlap rule (5) for the placed doors
- The left side: derived from the entry side, not mirrored; it has neither doors nor windows yet
- Default door set per `bus_class`, window band per `floor_type`
- Front template (`front.template`) and rear template; the front map only has the badge
- Two decks for `low_floor_lower_level`; `door_side`

## Conventions in this code

- Tunables live in a named-const block at the top of each file; several related consts per line.
- Pure, expression-style functions and pipelines (`flatMap`/`reduce`), terse names (`inp`, `mk*`, `fmt`, `el`).
- JSDoc on every export with `@param`/`@returns`; one-line `/** */` on non-obvious helpers.
