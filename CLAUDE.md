# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Boxy 3D bus rendered in three.js from one input JSON (`schema/bus-input.schema.json`, contract v2.0).
This is v1: no ML branch (no VLM, no OpenCV). The schema's `photo` field is accepted and ignored.
`docs/flowchart.html` shows the full intended pipeline including the ML branch, for reference only.

Plain ES modules, no TypeScript, no framework, no linter. Vite for the browser app, `node --test` for tests.
The renderer is a library of plain functions: `faces(inp)` gives the 2D face maps, `mkBus(inp, maps)` the
three.js model. `guide/bus-3d.js` wraps them as a `<bus-3d>` element, the user guide's example host; the
app in `main.js` / `ui.js` uses that element.

## Commands

```sh
npm i
npm run dev                                   # vite; ?bus=<id> picks an example (id = file name without .json)
npm run build
npm run build:lib                             # the library as ES modules in dist-lib/, three and ajv external
npm test                                      # node --test, picks up test/*.test.js
node --test --test-name-pattern='derives'     # single test by name
npm run validate -- examples/*.json           # schema + cross-field rules, exit 1 on any failure
```

## Architecture

Everything flows from one validated input object (`inp`). Units are **mm** everywhere except inside
three.js, where `MM = 0.001` (`dims.js`) converts to metres at the last moment.

```
core   validate.js  derive.js  dims.js                  pure, no DOM, no three
2D     vector.js                                        core only: no three
3D     bus.js  scene.js  views.js                       core + three: no vector.js
guide  guide/bus-3d.js  <bus-3d>                        the package entry (index.js) only
app    main.js  ui.js  edit.js  gallery.js  index.html  style.css   imports the library and the guide, never the reverse
```

The host connects the two sides: `const maps = faces(inp); mkBus(inp, maps)`. The 3D side takes
the face maps as input and never imports what produced them; `test/lib.test.js` scans the imports
and fails when a layer reaches the wrong way, or when the guide element needs more than the
package entry. Tabs, caption, view bar, header and cards are host chrome, not part of the library.

- **`validate.js`** — Ajv (draft 2020-12) against the schema, then the `rules` array for what JSON
  Schema cannot express. The rules are numbered (1)–(5) in the schema's top-level `$comment`;
  (1)–(4) are implemented, (5) (door overlap) is not checked yet. Cross-field rules only run
  when the schema passes. Returns `string[]`, empty when valid.
- **`derive.js`** — pure functions, no DOM, no three: `layout` (per-section `x0`, absolute axle x,
  bellows), `total`, `spans` (overhangs/wheelbases), `tyreDia`, `bodyTop`, `endH` (the height of a flat end face, which `faces` draws and `mapErrs` checks), `hints`, `arch` (the
  wheel-arch circle the model cuts out), `doors` (every hint placed as a span per section:
  the zone gives a span clear of body ends and arches, the bias a position in it), `lintel` (the
  line doors and side windows reach up to: the body top less `band_above_mm`), `sill` (the line
  side windows reach down to: `win_band_height_mm` below `lintel`, never below the skirt; both
  are root values of the input for the whole bus, their defaults read from the schema), `grill`
  (the line the badge and the headlights stand on: `band_below_grill_mm`, a root value too, up
  from the lower edge of the flat front), `dash` (the line the windshield reaches down to:
  `band_below_windshield_mm` from that same edge, or 200 mm below `sill` when missing), `windows`
  (per section equal panes, a pillar between each two, in the runs its doors leave, straight
  across the wheel arches; `windows_hint.count` fixes how many), `windowsLeft`
  (the side across from the doors: per section one run of equal panes, as many as the entry
  side has panes and doors there). Input axles are
  section-relative; `layout` gives both `axles` (absolute from the front end) and `local`.
  Node-safe, so it is what the tests cover.
- **`dims.js`** — fixed body proportions (clearance, corner radius, arch gap, tyre, roof pod) shared
  by the 2D and 3D sides. Anything both `vector.js` and `bus.js` must agree on lives here.
- **`vector.js`** — `faces(inp)` returns SVG maps per box side (`right`/`left` one per section,
  `front`/`rear` one each), in mm, as seen from outside. This is the **single source** for both the
  3D face textures and the app's map card: it shows exactly what is projected onto the model,
  so nothing that is separate geometry (wheels, bellows, roof pod) goes into a face map, and
  nothing the model cuts out of a box either: a side map has no wheel arches. New surface
  detail (front/rear templates) belongs here, not as extra meshes in `bus.js`. The doors and
  window panes from `derive.js` `doors` / `windows` are drawn on the right side only, mirrored by
  `flip`: the panes from `sill` up to `lintel`, the doors from their own sill up to `lintel`,
  both in the same frame (`framed`: one colour, width and corner radius). The left side takes
  the panes of `windowsLeft` unflipped, in the same band and frame, and no doors.
  The front map has a windscreen in that frame, from `lintel` down to `dash` but never closer
  to the badge than `SCREEN_GAP` (an end map starts `CORNER` below the body top), left out
  when there is no room for it; a root `front_display` text is shown on a destination display
  (`display`: dark quad, dark-gray outline) at the top of the windscreen's pane, when the pane is
  high enough (the app passes `signed(inp)` from `edit.js`, which puts `model` there when the
  input has none); the badge
  stands on `grill`, with a headlight on each side of it: one
  drawing of the left one (`src/headlight.svg`, imported as text and parsed, or
  `faces(inp, { headlight })`), placed again mirrored. `test/raw.js` lets node load that
  `?raw` import; a test file reaching `vector.js` imports it first.
  `test/vector.test.js` runs `faces` against a stand-in `document`.
- **`bus.js`** — `mkBus(inp, maps, { detail })` (`detail` scales the face textures' density, 1 for the viewer): per section an extruded side profile with arch cut-outs, liners,
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
  maps of a model, `dispose` the stage itself; `shot` draws a frame and returns it as a JPEG data URL. The frame loop runs only while `el` has a size:
  a hidden stage draws nothing. `mkStageShot({ w, h, bg })` is the same rig for pictures only: a canvas
  outside the document, no frame loop, a transparent sky, an unlit plane in `plane(bg)` ending in a sharp edge,
  and `shot()` a PNG `Blob` once the textures are in (`ready`). `bgOf(el)` gives the colour a picture lies on.
- **`views.js`** — `VIEWS` and animated flights between them (registered as a stage tick). No buttons.
- **`guide/bus-3d.js`** — `<bus-3d>`, not in the package: needs both `inp` and `faces`; setting
  either queues one rebuild in a microtask. The first rebuild aims at `view`, later ones keep the
  camera, so a host that wants a re-aim calls `go()` on `busrender`. An invalid `inp`, or maps that
  do not fit its sections, fire `buserror` and leave the last render. Disconnecting disposes the
  stage; reconnecting rebuilds. It imports `src/index.js` alone, as a host imports the package.
- **`core.js`**, **`index.js`** — package entries (`./core`, `.`); `./faces` is `vector.js` itself.
  `index.js` adds `faces`, `mkBus`, `mapErrs`, `mkStage`, `mkStageShot`, `mkViews` and `VIEWS` to core.
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
- **`ui.js`** — header, view bar, map card (tabs per side, clones of the face maps of the open side,
  sections reversed on the right side) and the input card (`form`): one accordion group per
  part of the schema. `el()` binds a function prop or child as a signal effect; `scoped` collects
  those effects so a form is disposed as one. The form is built once per selected bus and its
  controls follow the signals, so focus survives an edit; only a section's axle inputs and its
  door blocks are rebuilt, when their count changes. Enum values are `<select>`s (`kind: 'enum'`).
- **`gallery.js`** — `gallery(buses, pick)`: a page of cards, one per bus in the order given, no edit chrome. Every
  picture is taken on one `mkStageShot` stage, on the colour behind the cards (`bgOf`), at `DETAIL` texture density
  (a card needs a third of the viewer's; rasterising the SVG maps was most of the cost of shooting), one bus after the other: a
  `<bus-3d>` per card would run past the browser's WebGL context limit. A card opens its bus in
  the viewer.
- **`main.js`** — loads every `examples/**/*.json` through `import.meta.glob`, so any file dropped in
  `examples/` becomes a selectable bus. A bus in a directory under `examples/` belongs to that set:
  no header button of its own, but a card on the set's page, which is the route `#<set>` and one
  header button (`SETS`; `busnordic` is the only one). A set's cards page is cached per colour scheme: the pictures take the page's colours, so a scheme switch shoots them again once. Without `?bus=` the app opens on the first bus directly in `examples/`, which is the first
  header button. Opening a bus from a button or a card pushes a history entry naming it in `?bus=`;
  `follow` selects the address bar's bus and route after a step in the history. A selected bus of a set gets the last button among the
  concrete vehicles, pressed while the viewer shows it; the set's own button is pressed on its
  cards page only. The header has two captioned groups:
  "Concrete vehicles:" for the buses directly in `examples/`, "Type set:" for the sets. On a cards page `body[data-page]` hides the
  viewer and all edit chrome. Selecting validates first and shows errors in `#err`. Owns
  what is app layout: the view offset that keeps the bus clear of the details panel.
  State is `@preact/signals-core` (app only, banned from the library by `test/lib.test.js`):
  `src` the example as loaded, `draft` with every edit, `ok` the last valid draft, `maps` the
  face maps of `ok`. Everything
  drawn (model, maps, header, derived rows) reads `ok`; the controls read `draft`, so an invalid
  edit stays in its field, marked, while the last valid bus stays on screen. Only another bus
  re-aims the camera. Beside the title, `#json` holds two links: Original, the file as loaded, which warns
  through `<dialog id="drift">` once `draft` differs from `src`, and Modified, a download of
  `toJson(ok)` (`edit.js`), there once `ok` differs from `src`.

### Coordinate conventions

- `mkBus` returns a group with the front end at x = 0 running towards +x, ground at y = 0, z centred;
  `bus-3d.js` then shifts it by `-len/2` so the bus is centred with the front towards −x.
- Extrude caps: z = 0 is the right side, z = w the left side.
- Right-side face maps are mirrored (front points right): `faces()` flips the spans it draws, the
  texture uses a negative `repeat.x`, and the app's map card reverses section order for that side.

### Schema and examples

- `examples/` are the schema's own `examples` (Citaro G has `roof_equipment_mm` added). Tests load
  `volvo-8900` and `citaro-g` by name and assert exact derived numbers, and the reject cases are
  built by patching those two — changing them means updating `test/validate.test.js`.
- `examples/busnordic/` is one generic bus per row of the Bus Nordic 2.0 "Examples of bus types"
  tables (17), brand `BusNordic`, model `<class>:<max length> <floor or HC>`. Only class, length
  band, floor type and door count come from the standard. `test/validate.test.js` checks the set.
- The schema is strict (`additionalProperties: false`, `unevaluatedProperties: false` on sections).
- `vite.config.js` sets `assetsInlineLimit: 0` on purpose: the header's source link must point at a
  real `.json` file, not a `data:` URL.

## Not done yet (v1)

Tracked in `README.md`; these are parsed/validated but not drawn:

- The door-overlap rule (5) for the placed doors
- The left side: no doors of its own (a driver door), and `door_side` is not honoured
- Default door set per `bus_class`, window band per `floor_type`
- Front template (`front.template`): the front map is one generic front (windscreen, headlights, badge); rear template
- Two decks for `low_floor_lower_level`; `door_side`

## Conventions in this code

- Tunables live in a named-const block at the top of each file; several related consts per line.
- Pure, expression-style functions and pipelines (`flatMap`/`reduce`), terse names (`inp`, `mk*`, `fmt`, `el`).
- JSDoc on every export with `@param`/`@returns`; one-line `/** */` on non-obvious helpers.
