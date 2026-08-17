#!/usr/bin/env node
/**
 * Convert a rowing-logbook CSV export into `trips` documents for Firestore import.
 *
 *   node scripts/import-trips.mjs <input.csv> [--tenant scs] [--type logbuch]
 *                                 [--out trips.json] [--refresh] [--report]
 *
 * Lookups (resources of type `rboat`, locations, persons) are read once from Firestore
 * and cached in `.import-trips-lookups.json` next to the output; `--refresh` re-reads them.
 * `--report` prints unmatched names and writes nothing.
 *
 * Rows sharing (startDate, startTime, boat, distance) become ONE trip with several
 * participants. Nothing is written to Firestore — import the JSON yourself.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const has = (name) => args.includes(`--${name}`);
const csvPath = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
if (!csvPath) {
  console.error('usage: node scripts/import-trips.mjs <input.csv> [--tenant scs] [--type logbuch] [--out trips.json] [--refresh] [--report]');
  process.exit(1);
}
const TENANT = flag('tenant', 'scs');
const TRIP_TYPE = flag('type', 'logbuch');
const OUT = flag('out', join(dirname(csvPath), 'trips.json'));
const CACHE = join(dirname(OUT), '.import-trips-lookups.json');

// ---------------------------------------------------------------- lookups

async function loadLookups() {
  if (existsSync(CACHE) && !has('refresh')) return JSON.parse(readFileSync(CACHE, 'utf8'));
  const { default: admin } = await import('firebase-admin');
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();
  const grab = async (coll, fields) => {
    const snap = await db.collection(coll).where('tenants', 'array-contains', TENANT).get();
    return snap.docs.map((d) => {
      const x = d.data();
      const o = { okey: d.id };
      for (const f of fields) o[f] = x[f];
      return o;
    });
  };
  const out = {
    resources: await grab('resources', ['name', 'type', 'subType', 'isArchived']),
    locations: await grab('locations', ['name', 'type', 'isArchived']),
    persons: await grab('persons', ['firstName', 'lastName', 'isArchived']),
  };
  writeFileSync(CACHE, JSON.stringify(out, null, 1));
  return out;
}

// ---------------------------------------------------------------- matching

/** lowercase, strip diacritics + everything that is not a letter/digit. */
const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Boat-name noise in the CSV that the resource names do not carry. */
const BOAT_ALIASES = {
  // csv name (normalized) -> resource name
  mm: 'm + m',
  rablus: 'Räbluus',
  rode: 'Rhode',
  toro: 'El Toro',
  oberlix: 'Obelix',
  aqua: 'Acqua',
  fipper: 'Flipper',
  l1xl: '1XL',
  panzerskiff1: 'Panzki 1',
  panzerskiff2: 'Panzki 2',
};
/** Suffixes the CSV appends to a boat name (rigging hints), stripped before matching. */
const BOAT_SUFFIX = /(1x|2x|2-|4x|8\+|skiff)$/;

function matchBoat(raw, index) {
  let k = norm(raw);
  if (BOAT_ALIASES[k]) k = norm(BOAT_ALIASES[k]);
  if (index.has(k)) return index.get(k);
  const stripped = BOAT_ALIASES[k.replace(BOAT_SUFFIX, '')] ? norm(BOAT_ALIASES[k.replace(BOAT_SUFFIX, '')]) : k.replace(BOAT_SUFFIX, '');
  if (index.has(stripped)) return index.get(stripped);
  // "Corsin's Skiff 1x" -> "corsin", "Fisherman's Friend" -> "fishermans"
  for (const [key, val] of index) if (stripped.startsWith(key) && key.length >= 4) return val;
  return null;
}

/** CSV route label -> location name. Everything not listed is treated as "no location". */
const LOCATION_ALIASES = {
  feldbachlowe: 'Feldbach, Löwe',
  feldbachumufenau: 'Feldbach - Ufenau',
  ufenau: 'Feldbach - Ufenau',
  seesternbuchtrapperswil: 'Rapperswil, Seestern',
  rapperswilhafen: 'Rapperswil, Hafen',
  rapperswiltechnikum: 'Rapperswil, Technikum',
  technikumrapperswildirekterweg: 'Rapperswil, Technikum',
  technikumrapperswilviahurden: 'Rapperswil - Hurden',
  technikumrapperswilviamittlererdurchstich: 'Rapperswil, Technikum',
  rapperswilhurden: 'Rapperswil - Hurden',
  hurden: 'Hurden',
  gubelfelsen: 'Gubel, Felsen',
  felsengubel: 'Gubel, Felsen',
  risiwc: 'Risi, WC',
  wcrisi: 'Risi, WC',
  kehlhofhaab: 'Kehlhof, Haab',
  schirmensee: 'Schirmensee',
  brunishausen: 'Brünishusen',
  uerikonschiffssteg: 'Uerikon, Schiffssteg',
  uetikonschiffssteg: 'Uetikon, Schiffssteg',
  meilenschiffssteg: 'Meilen, Schiffssteg',
  obermeilenschiffssteg: 'Obermeilen, Schiffssteg',
  mannedorfschiffssteg: 'Männedorf, Schiffssteg',
  stafaschiffssteg: 'Stäfa, Schiffssteg',
  herrlibergschiffssteg: 'Herrliberg, Schiffssteg',
  richterswilbootshaus: 'Richterswil, Bootshaus',
  wadenswilbootshausbaech: 'Wädenswil, Bootshaus',
};

function matchLocation(raw, index) {
  const k = norm(raw);
  if (!k || k.startsWith('anderestrecke') || k.startsWith('andere')) return null;
  if (LOCATION_ALIASES[k]) return index.get(norm(LOCATION_ALIASES[k])) ?? null;
  return index.get(k) ?? null;
}

/** German transliteration variant, so "Mueller" and "Müller" normalize alike. */
const deUml = (s) => norm(s).replace(/ue/g, 'u').replace(/oe/g, 'o').replace(/ae/g, 'a');

/** One name matches the other if either is a prefix of the other (>= `min` chars). */
const looseEq = (a, b, min) =>
  a === b || (a.length >= min && b.length >= min && (a.startsWith(b) || b.startsWith(a)));

/** Nickname pairs the prefix rule cannot bridge. csv given name -> db given name. */
const FIRSTNAME_ALIASES = {
  thomas: 'tom', kathrin: 'katharina', catherine: 'katharina', henry: 'heinrich',
  gerry: 'gerhard', ruedi: 'rudolf', res: 'andreas', gusti: 'august',
  balz: 'balthasar',
};
/** Surname spellings the CSV gets wrong. csv surname -> db surname. */
const LASTNAME_ALIASES = { gache: 'gasche', janibelli: 'jannibelli' };

const tokens = (s) => (s ?? '').split(/[\s-]+/).map(deUml).filter(Boolean);
/** any csv token loosely equals any db token (after alias substitution) */
const anyToken = (dbToks, csvToks, aliases, min) =>
  dbToks.some((d) => csvToks.some((c) => looseEq(d, aliases[c] ?? c, min)));

/**
 * "Lastname Firstname" (usually), sometimes reversed. Matches exactly first, then
 * token-wise: double surnames ("Krebs-Wirth", "Wicki Friedli"), extra given names
 * ("Liam Quentin"), nicknames, and ue/ü spellings. Ambiguous => null (reported).
 */
function matchPerson(raw, byKey, persons) {
  const parts = (raw ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || norm(parts[0]) === 'gast') return null;
  // exact: try every split point, both orders ("Ochsner Janibelli Gabriela", "Rahel Peter")
  for (let i = parts.length - 1; i >= 1; i--) {
    const a = norm(parts.slice(0, i).join('')), b = norm(parts.slice(i).join(''));
    const hit = byKey.get(a + '|' + b) ?? byKey.get(b + '|' + a);
    if (hit) return hit;
  }
  // loose: the CSV tokens must cover a surname token AND a given-name token
  const csvToks = parts.map(deUml);
  const hits = persons.filter(
    (p) =>
      anyToken(tokens(p.lastName), csvToks, LASTNAME_ALIASES, 4) &&
      anyToken(tokens(p.firstName), csvToks, FIRSTNAME_ALIASES, 3),
  );
  if (hits.length !== 1) return null;
  looseHits.set(raw.trim(), `${hits[0].lastName} ${hits[0].firstName}`);
  return hits[0];
}
/** csv name -> db name for every fuzzy (non-exact) person match, for review. */
const looseHits = new Map();

// ---------------------------------------------------------------- csv

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n');
  lines.shift(); // header
  return lines.map((line) => {
    const [start, end, boat, route, distance, ...rest] = line.split(',');
    return { start, end, boat, route, distance, person: rest.join(',') };
  });
}

const asDate = (dt) => dt?.slice(0, 10).replace(/-/g, '') ?? '';
const asTime = (dt) => dt?.slice(11, 16).replace(':', '') ?? '';

// ---------------------------------------------------------------- main

const lookups = await loadLookups();
const boatIndex = new Map(
  lookups.resources.filter((r) => r.type === 'rboat').map((r) => [norm(r.name), r]),
);
const locIndex = new Map(lookups.locations.map((l) => [norm(l.name), l]));
const personIndex = new Map(
  lookups.persons.map((p) => [norm(p.lastName) + '|' + norm(p.firstName), p]),
);

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const unmatched = { boats: new Map(), routes: new Map(), persons: new Map() };
const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
const trips = new Map();

for (const row of rows) {
  const boat = matchBoat(row.boat, boatIndex);
  if (!boat) bump(unmatched.boats, row.boat);
  const loc = matchLocation(row.route, locIndex);
  if (!loc && row.route && !norm(row.route).startsWith('andere')) bump(unmatched.routes, row.route);
  const person = matchPerson(row.person, personIndex, lookups.persons);
  if (!person && norm(row.person) && norm(row.person) !== 'gast') bump(unmatched.persons, row.person.trim());

  const startDate = asDate(row.start);
  const startTime = asTime(row.start);
  const distance = Number(row.distance) || 0;
  const key = [startDate, startTime, norm(row.boat), distance].join('|');
  let trip = trips.get(key);
  if (!trip) {
    trip = {
      okey: `${startDate}${startTime}-${norm(row.boat)}-${distance}`,
      tenants: [TENANT],
      isArchived: false,
      name: `${startDate}${startTime}${boat?.name ?? row.boat}`,
      type: TRIP_TYPE,
      index: '',
      tags: [],
      notes: '',
      startDate,
      startTime,
      endDate: asDate(row.end),
      endTime: asTime(row.end),
      resource: boat
        ? { key: boat.okey, name1: boat.name, name2: boat.name, modelType: 'resource', type: boat.type ?? 'rboat', subType: boat.subType ?? '', label: boat.name }
        : undefined,
      locations: loc
        ? [{ key: loc.okey, name1: loc.name, name2: '', modelType: 'location', type: loc.type ?? '', subType: '', label: loc.name }]
        : [],
      // a real route name we have no location doc for is worth keeping; the generic
      // "andere Strecke [NN km]" placeholder is not
      customLocationLabel: loc || norm(row.route).startsWith('andere') ? '' : (row.route ?? '').trim(),
      distance,
      participants: [],
      state: 'closed',
      rawBoat: (row.boat ?? '').trim(),
      unresolved: [],
    };
    trips.set(key, trip);
  }
  if (person) {
    if (!trip.participants.some((p) => p.key === person.okey)) {
      trip.participants.push({
        key: person.okey, name1: person.firstName ?? '', name2: person.lastName ?? '',
        modelType: 'person', type: '', subType: '',
        label: `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim(),
      });
    }
  } else if (row.person?.trim()) {
    // guests and names with no `persons` doc: keep the raw name so nothing is lost silently
    trip.unresolved.push(row.person.trim());
  }
}

// notes carry what could not be resolved to a document
for (const trip of trips.values()) {
  const parts = [];
  if (!trip.resource) parts.push(`Boot: ${trip.rawBoat}`);
  if (trip.unresolved.length) parts.push(`Ohne Personeneintrag: ${trip.unresolved.join(', ')}`);
  trip.notes = parts.join(' | ');
  delete trip.unresolved;
  delete trip.rawBoat;
}

// index, mirroring getTripIndex()
for (const trip of trips.values()) {
  const crew = trip.participants.map((p) => `${p.name1} ${p.name2}`.trim()).join(',');
  trip.index = `r:${trip.resource?.name2 ?? ''};d:${trip.startDate};p:${crew};`;
}

const list = [...trips.values()].sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
const dump = (label, m) => {
  if (!m.size) return;
  console.log(`\n${label} (${m.size}):`);
  for (const [k, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(4)}x  ${k}`);
};

console.log(`rows: ${rows.length} -> trips: ${list.length}`);
dump('UNMATCHED BOATS', unmatched.boats);
dump('UNMATCHED ROUTES', unmatched.routes);
dump('UNMATCHED PERSONS', unmatched.persons);
if (has('report') && looseHits.size) {
  console.log(`\nFUZZY PERSON MATCHES (${looseHits.size}) — review these:`);
  for (const [csv, db] of [...looseHits].sort()) console.log(`  ${csv.padEnd(30)} -> ${db}`);
}

if (!has('report')) {
  writeFileSync(OUT, JSON.stringify(list, null, 1));
  console.log(`\nwrote ${list.length} trips -> ${OUT}`);
}

// ---------------------------------------------------------------- self-check
// node scripts/import-trips.mjs <csv> --selftest   (exercises the three matchers)
if (has('selftest')) {
  const { strictEqual: eq } = await import('node:assert');
  const boat = (n) => matchBoat(n, boatIndex)?.name ?? null;
  eq(boat("Corsin's Skiff 1x"), 'Corsin');
  eq(boat('M&M'), 'm + m');
  eq(boat('Obelix 2x'), 'Obelix');
  eq(boat('El toro'), 'El Toro');
  eq(boat('F45'), null);
  const loc = (n) => matchLocation(n, locIndex)?.name ?? null;
  eq(loc('Feldbach Löwe'), 'Feldbach, Löwe');
  eq(loc('Seestern-Bucht Rapperswil'), 'Rapperswil, Seestern');
  eq(loc('andere Strecke  12 km'), null);
  eq(loc('Lützelau'), null);
  const who = (n) => { const p = matchPerson(n, personIndex, lookups.persons); return p ? `${p.lastName} ${p.firstName}` : null; };
  eq(who('Büchel Thomas'), 'Büchel Tom');          // nickname
  eq(who('Krebs Doris'), 'Krebs-Wirth Doris');     // double surname
  eq(who('Mueller Magalie'), 'Müller Magalie');    // ue/ü
  eq(who('Rahel Peter'), 'Peter Rahel');           // reversed
  eq(who('Gast'), null);
  eq(who('Widmer Laura'), null);                   // absent, must not fall back to another Widmer
  console.log('selftest ok');
}
