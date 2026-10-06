# 3dbus

Boxy 3D bus rendered in three.js from one input JSON. This is the base for v1, which has no ML
branch: no VLM, no OpenCV. The schema's `photo` field is accepted and ignored; door and window
layout comes from `doors_hint`, `windows_hint` and the template defaults only.

## Layout

- `schema/bus-input.schema.json` — input contract v2.0, verbatim from the design chat
- `examples/` — the schema's two `examples`: rigid Volvo 8900 LE, articulated Citaro G (with `roof_equipment_mm` added)
- `src/validate.js` — schema + the cross-field rules the schema cannot express
- `src/derive.js` — section layout, total length, overhangs and wheelbases from `axles_mm`, tyre diameter from `tyre.size`
- `src/dims.js` — fixed body proportions shared by the 3D model and the 2D map
- `src/bus.js` — 3D model: extruded side profile with wheel arches, wheels, bellows, roof pod
- `src/scene.js` — stage: renderer, sky, fog, lights, shadows, ground, orbit controls
- `src/views.js` — camera view bar and flights between views
- `src/vector.js` — 2D vector map: entry-side and front elevations as SVG
- `src/ui.js` — header and the details cards
- `src/main.js` — wiring and bus switching
- `docs/flowchart.html` — the full pipeline including the ML branch, for reference

## Run

```sh
npm i
npm run dev                              # ?bus=citaro-g picks the other example
npm test
npm run validate -- examples/*.json
```

## Not done yet (v1)

- Door placement from `doors_hint` (zone, bias, leaves) and the door-overlap rule
- Windows: equal panes in the band, skipping door spans; left side derived, not mirrored
- Default door set per `bus_class`, window band per `floor_type`
- Front template (`front.template`) and rear template; the 2D front only has the badge
- Two decks for `low_floor_lower_level`; `door_side` only flips the 2D side view so far
