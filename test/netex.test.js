import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromNetex, KEYS, PREFIX } from '../src/netex.js';

const RIGID = readFileSync(new URL('./netex/rigid.xml', import.meta.url), 'utf8');
const ARTIC = readFileSync(new URL('./netex/artic.xml', import.meta.url), 'utf8');

/** The fixture with `from` replaced once by `to`; fails when `from` is not in it. */
const patch = (xml, from, to) => {
  assert.ok(xml.includes(from), `fixture holds ${from}`);
  return xml.replace(from, to);
};

/** Asserts a reject whose errors mention every one of `words`. */
const rejects = (res, ...words) => {
  assert.equal(res.ok, false, JSON.stringify(res));
  words.forEach((w) => assert.ok(res.errs.some((e) => e.includes(w)), `an error names ${w}: ${JSON.stringify(res.errs)}`));
};

test('the default prefix and the key suffixes', () => {
  assert.equal(PREFIX, '3dbus:');
  assert.deepEqual(Object.keys(KEYS), ['vehicleType', 'deck', 'entrance']);
  assert.ok(KEYS.deck.includes('length_mm') && KEYS.entrance.includes('leaves') && KEYS.vehicleType.includes('base_color'));
});

test('maps a VehicleType without a DeckPlan to one section', () => {
  const res = fromNetex(RIGID);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.inp, {
    schema_version: '3.0', width_mm: 2550, height_mm: 3300, band_above_mm: 250,
    tyre: { size: '295/80 R22.5' }, base_color: { hex: '#E9ECEC' }, front: { badge_text: 'Volvo' },
    front_display: '8900 LE 12.4 m',
    sections: [{ length_mm: 12396, axles_mm: [2769, 9099], windows_hint: { count: 5 } }],
  });
  assert.deepEqual(res.warns, []);
});

test('maps Decks to sections and right-side entrances to absolute doors', () => {
  const res = fromNetex(ARTIC);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.inp.sections, [
    { length_mm: 10600, axles_mm: [2700, 8600], doors: [{ x_mm: 600, width_mm: 1250, leaves: 2 }, { x_mm: 4800, width_mm: 1250, leaves: 2 }] },
    { length_mm: 7000, bellows_ahead_mm: 600, axles_mm: [4700], doors: [{ x_mm: 300, width_mm: 1250, leaves: 2 }] },
  ]);
  assert.deepEqual(res.inp.tyre, { diameter_mm: 950 });
  assert.deepEqual(res.inp.front, { badge_text: 'Mercedes-Benz' });
  assert.equal(res.inp.front_display, 'Citaro G');
  assert.deepEqual(res.warns, []);
});

test('reads namespace-prefixed elements', () => {
  const res = fromNetex(ARTIC);
  assert.equal(res.ok, true);
  assert.equal(res.inp.width_mm, 2550);
  assert.equal(res.inp.sections.length, 2);
});

test('sorts doors front to rear', () => {
  const xs = fromNetex(ARTIC).inp.sections[0].doors.map((d) => d.x_mm);
  assert.deepEqual(xs, [600, 4800]);
});

test('reads lists with spaces, and Values that look like numbers', () => {
  const [s] = fromNetex(RIGID).inp.sections;
  assert.deepEqual(s.axles_mm, [2769, 9099]);
  assert.deepEqual(s.windows_hint, { count: 5 });
});

test('a Name that looks like a number stays text', () => {
  const res = fromNetex(patch(RIGID, '<Name>8900 LE 12.4 m</Name>', '<Name>8900</Name>'));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.inp.front_display, '8900');
});

test('reads a glazed entrance and a tyre_rear_twin', () => {
  const xml = patch(patch(ARTIC,
    '<netex:Key>3dbus:leaves</netex:Key><netex:Value>2</netex:Value></netex:KeyValue>',
    '<netex:Key>3dbus:leaves</netex:Key><netex:Value>2</netex:Value></netex:KeyValue><netex:KeyValue><netex:Key>3dbus:glazed</netex:Key><netex:Value>false</netex:Value></netex:KeyValue>'),
    '<netex:Key>3dbus:base_color</netex:Key>',
    '<netex:Key>3dbus:tyre_rear_twin</netex:Key><netex:Value>true</netex:Value></netex:KeyValue><netex:KeyValue><netex:Key>3dbus:base_color</netex:Key>');
  const res = fromNetex(xml);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.inp.tyre, { diameter_mm: 950, rear_twin: true });
  assert.deepEqual(res.inp.sections[0].doors[1], { x_mm: 4800, width_mm: 1250, leaves: 2, glazed: false });
  rejects(fromNetex(patch(xml, '<netex:Value>false</netex:Value>', '<netex:Value>no</netex:Value>')), '3dbus:glazed');
});

test('an empty element still reads', () => {
  const res = fromNetex(patch(patch(ARTIC, '<netex:DistanceFromFront>0.3</netex:DistanceFromFront>',
    '<netex:keyList/><netex:DistanceFromFront>0.3</netex:DistanceFromFront>'),
    '<netex:Key>3dbus:length_mm</netex:Key><netex:Value>7000</netex:Value></netex:KeyValue>',
    '<netex:Key>3dbus:length_mm</netex:Key><netex:Value>7000</netex:Value></netex:KeyValue><netex:KeyValue/>'));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.inp.sections, fromNetex(ARTIC).inp.sections);
});

test('a different prefix reads other keys', () => {
  const acme = RIGID.replaceAll('3dbus:', 'acme:');
  const res = fromNetex(acme, { prefix: 'acme:' });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.inp, fromNetex(RIGID).inp);
  rejects(fromNetex(acme), '3dbus:base_color');
});

test('with a DeckPlan, the VehicleType axles_mm and windows_count are not read', () => {
  const res = fromNetex(patch(ARTIC, '<netex:Key>3dbus:base_color</netex:Key>',
    '<netex:Key>3dbus:axles_mm</netex:Key><netex:Value>x</netex:Value></netex:KeyValue><netex:KeyValue><netex:Key>3dbus:base_color</netex:Key>'));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.inp, fromNetex(ARTIC).inp);
});

test('a ClassifiedAsRef with no VehicleModel leaves the badge out, with a warning', () => {
  const res = fromNetex(patch(ARTIC, 'ref="3dbus:VehicleModel:citaro"', 'ref="3dbus:VehicleModel:gone"'));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.inp.front, undefined);
  assert.equal(res.warns.length, 1);
  assert.match(res.warns[0], /3dbus:VehicleModel:gone/);
});

test('a Length that disagrees with the sections is a warning', () => {
  const res = fromNetex(patch(ARTIC, '<netex:Length>18.2</netex:Length>', '<netex:Length>18.3</netex:Length>'));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.warns.length, 1);
  assert.match(res.warns[0], /18300/);
  assert.match(res.warns[0], /18200/);
});

test('rejects a file with no VehicleType', () =>
  rejects(fromNetex('<PublicationDelivery><dataObjects><ResourceFrame id="f"/></dataObjects></PublicationDelivery>'), 'VehicleType'));

test('rejects what is not XML', () => rejects(fromNetex('<VehicleType id="v"><Width>2.55</VehicleType>'), 'XML'));

test('rejects a VehicleType without Width', () => rejects(fromNetex(patch(RIGID, '<Width>2.55</Width>', '')), 'Width'));

test('rejects a Width that is not a number', () => rejects(fromNetex(patch(RIGID, '<Width>2.55</Width>', '<Width>wide</Width>')), 'Width'));

test('rejects a VehicleType without Length when there is no DeckPlan', () =>
  rejects(fromNetex(patch(RIGID, '<Length>12.396</Length>', '')), 'Length'));

test('rejects a Deck without length_mm', () =>
  rejects(fromNetex(patch(ARTIC, '<netex:KeyValue><netex:Key>3dbus:length_mm</netex:Key><netex:Value>10600</netex:Value></netex:KeyValue>', '')),
    '3dbus:length_mm', '3dbus:Deck:lead'));

test('rejects a trailing Deck without bellows_ahead_mm', () =>
  rejects(fromNetex(patch(ARTIC, '<netex:KeyValue><netex:Key>3dbus:bellows_ahead_mm</netex:Key><netex:Value>600</netex:Value></netex:KeyValue>', '')),
    '3dbus:bellows_ahead_mm', '3dbus:Deck:trailer'));

test('rejects axles_mm that are not mm', () => {
  rejects(fromNetex(patch(ARTIC, '2700,8600', '27x0,8600')), '3dbus:axles_mm', '27x0');
  rejects(fromNetex(patch(RIGID, '<Value>5</Value>', '<Value>5.5</Value>')), '3dbus:windows_count');
  rejects(fromNetex(patch(RIGID, '<Value>250</Value>', '<Value>250.4</Value>')), '3dbus:band_above_mm');
});

test('rejects an entrance without leaves', () =>
  rejects(fromNetex(patch(ARTIC, '<netex:KeyValue><netex:Key>3dbus:leaves</netex:Key><netex:Value>2</netex:Value></netex:KeyValue>', '')),
    '3dbus:leaves', '3dbus:PassengerEntrance:middle'));

test('rejects a DeckPlanRef with no DeckPlan', () =>
  rejects(fromNetex(patch(ARTIC, 'DeckPlan id="3dbus:DeckPlan:citaro-g"', 'DeckPlan id="3dbus:DeckPlan:other"')), 'DeckPlanRef', '3dbus:DeckPlan:citaro-g'));

test('rejects an entrance on the wheel arch, as the render input does', () =>
  rejects(fromNetex(patch(ARTIC, '<netex:DistanceFromFront>4.8</netex:DistanceFromFront>', '<netex:DistanceFromFront>2.0</netex:DistanceFromFront>')),
    'Deck 3dbus:Deck:lead: sections[0]', 'axle 1'));

test('rejects a Deck on a second DeckLevel', () => {
  const xml = patch(ARTIC, `<netex:DeckLevelRef ref="3dbus:DeckLevel:main" version="1"/>
                  <netex:deckSpaces>
                    <netex:PassengerSpace id="3dbus:PassengerSpace:trailer"`, `<netex:DeckLevelRef ref="3dbus:DeckLevel:upper" version="1"/>
                  <netex:deckSpaces>
                    <netex:PassengerSpace id="3dbus:PassengerSpace:trailer"`);
  rejects(fromNetex(xml), '3dbus:Deck:trailer', 'not supported');
});

test('asks for an id when the file has two VehicleTypes', () => {
  const two = patch(RIGID, '</vehicleTypes>', `  <VehicleType id="3dbus:VehicleType:other" version="1">
            <keyList><KeyValue><Key>3dbus:tyre_size</Key><Value>275/70 R22.5</Value></KeyValue>
              <KeyValue><Key>3dbus:base_color</Key><Value>#000000</Value></KeyValue>
              <KeyValue><Key>3dbus:axles_mm</Key><Value>2500,8000</Value></KeyValue></keyList>
            <Length>10.5</Length><Width>2.5</Width><Height>3.2</Height>
          </VehicleType>
        </vehicleTypes>`);
  rejects(fromNetex(two), '3dbus:VehicleType:8900-12.4', '3dbus:VehicleType:other');
  const other = fromNetex(two, { id: '3dbus:VehicleType:other' });
  assert.equal(other.ok, true, JSON.stringify(other));
  assert.equal(other.inp.sections[0].length_mm, 10500);
  assert.equal(other.inp.front, undefined);
  assert.equal(fromNetex(two, { id: '3dbus:VehicleType:8900-12.4' }).inp.sections[0].length_mm, 12396);
  rejects(fromNetex(two, { id: 'nope' }), 'nope');
});
