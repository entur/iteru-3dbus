import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import Ajv from 'ajv';

const SLICE = new URL('../schema/netex/vehicle-type.schema.json', import.meta.url);
const SCRIPT = new URL('../scripts/netex-slice.js', import.meta.url);
const BASE = new URL('../../netex-typescript-model/generated-src/base/base.schema.json', import.meta.url);
const slice = JSON.parse(readFileSync(SLICE, 'utf8'));
const defs = slice.definitions;
const ajv = new Ajv({ allErrors: true });

/** True when `x` holds `additionalProperties: false` anywhere. */
const closed = (x) => x !== null && typeof x === 'object'
  && (x.additionalProperties === false || Object.values(x).some(closed));

test('the slice keeps what B reads', () => {
  ['VehicleType', 'DeckPlan', 'Deck', 'PassengerSpace', 'PassengerEntrance', 'VehicleModel', 'KeyValue']
    .forEach((n) => assert.ok(defs[n], n));
  ['Length', 'Width', 'Height', 'Name', 'keyList', 'DeckPlanRef', 'ClassifiedAsRef']
    .forEach((p) => assert.ok(defs.VehicleType.properties[p], p));
});

test('post-fix #52+#16: a deck lists its spaces, a space its entrances, by their concrete names', () => {
  assert.equal(defs.deckSpaces.properties.PassengerSpace.type, 'array');
  assert.equal(defs.deckEntrances.properties.PassengerEntrance.type, 'array');
  assert.equal(defs.deckSpaces.properties.DeckSpace_Dummy, undefined);
});

test('post-fix #19: a MultilingualString may be plain text', () => {
  const ok = ajv.compile({ definitions: defs, allOf: [{ $ref: '#/definitions/MultilingualString' }] });
  assert.ok(ok('8900'));
  assert.ok(ok({ Text: [{ value: 'x' }] }));
  assert.ok(!ok(5));
});

test("post-fix #18: B's ids and refs are required", () => {
  ['VehicleType', 'DeckPlan', 'VehicleModel'].forEach((n) => assert.ok(defs[n].required.includes('id'), n));
  ['DeckPlanRef', 'ClassifiedAsRef'].forEach((n) => assert.ok(defs[n].required.includes('ref'), n));
});

test('the slice stays open', () => assert.equal(closed(slice), false));

test('each post-fix names its upstream issue', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  [52, 16, 19, 18].forEach((n) => assert.ok(src.includes(`netex-typescript-model#${n}`), `#${n}`));
});

test('a parsed VehicleType and DeckPlan validate; a VehicleType without id does not', () => {
  const vt = {
    id: 'v1', Name: '8900', Length: 12.396,
    keyList: { KeyValue: [{ Key: '3dbus:base_color', Value: '#E9ECEC' }] },
    DeckPlanRef: { ref: 'x', version: '1' },
  };
  const deckPlan = {
    id: 'dp1',
    decks: { Deck: [{ id: 'd1', deckSpaces: { PassengerSpace: [{ deckEntrances: { PassengerEntrance: [
      { DistanceFromFront: 0.6, Width: 1.25, VehicleSide: 'rightSide' }] } }] } }] },
  };
  const check = ajv.compile(slice);
  assert.ok(check({ VehicleType: vt, DeckPlan: deckPlan }), JSON.stringify(check.errors));
  const { id, ...noId } = vt;
  assert.ok(!check({ VehicleType: noId, DeckPlan: deckPlan }));
  assert.ok(!check({ VehicleType: { ...vt, Length: 'long' } }));
});

test('rightSide is a VehicleSide value upstream', { skip: !existsSync(BASE) }, () => {
  const side = JSON.parse(readFileSync(BASE, 'utf8')).definitions.VehicleSideEnumeration;
  assert.ok(side.enum.includes('rightSide'));
});
