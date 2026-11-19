#!/usr/bin/env node
/**
 * Reclassifies `locations` docs whose `type` is 'address' but which are not postal addresses.
 * `address` is reserved for real postal addresses (the postal-address-as-location model keys
 * them by the Swiss EGAID); until 2026-11 it was also DEFAULT_LOCATION_TYPE, so the bka diary
 * seed and the scs meeting import stamped towns, peaks and restaurants with it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   Dry-run by default. A dry run reads Firestore + the geocoders and writes a PLAN file
 *   (JSON) — `--plan=<path>`, which must lie outside this repository. `--write --plan=<path>`
 *   applies exactly that reviewed plan, with no geocoder calls, so what is written is what was
 *   reviewed. Before each update the doc is re-read: it is skipped when its type is no longer
 *   'address' or its name changed since the plan was made.
 *
 *   Only `type` changes (plus latitude/longitude/address for the scs venues). The document id
 *   (`okey`) never changes: calevents, diary entries, meetings and trips link by key.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHAT IT DOES
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   bka diary places («Aarau, Switzerland»): re-queries the Open-Meteo geocoder (same provider
 *   as scripts/seed-diary-locations.mjs), picks the hit nearest the stored coordinates (that is
 *   the hit the seed used) and maps its GeoNames feature_code to a `location_type` item. When
 *   the hit's country contradicts the country in the name, or no hit lies near the stored
 *   coordinates, the row is NOT reclassified but listed for manual review with the stored and
 *   the suggested coordinates («Amsterdam, Netherlands» stored in Tennessee).
 *
 *   scs board-meeting venues (scripts/import-meetings.mjs): fixed target type per venue; coords
 *   from the swisstopo SearchServer (attribution «© swisstopo», OGD) when a hit's name matches,
 *   the street address from the nearest GWR building entry. Anything else -> manual review.
 *
 * Usage:
 *   node scripts/migrate-location-types.mjs --plan=/tmp/location-types.json           # dry run
 *   node scripts/migrate-location-types.mjs --plan=/tmp/location-types.json --write   # apply
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const isWrite = args.includes('--write');
const planArg = args.find((a) => a.startsWith('--plan='))?.slice('--plan='.length);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!planArg) fail('--plan=<path> is required (outside the repository).');
const planPath = path.resolve(planArg);
if (planPath === REPO_ROOT || planPath.startsWith(REPO_ROOT + path.sep)) {
  fail(`--plan must lie outside the repository (${REPO_ROOT}).`);
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const LOCATIONS = 'locations';

// ═══════════════════════════════════════════════════════════════════════════════════════
// Classification rules
// ═══════════════════════════════════════════════════════════════════════════════════════

/** GeoNames feature_code -> location_type. Prefix match for PPL*, ADM*. */
export function typeFromFeatureCode(code) {
  const c = (code ?? '').toUpperCase();
  if (c.startsWith('PPL')) return 'city';
  // peaks, ranges, passes, hills, glaciers, ski areas / resorts
  if (['MT', 'MTS', 'PK', 'PKS', 'PASS', 'HLL', 'HLLS', 'GLCR', 'RSRT', 'SKI'].includes(c)) return 'mountain';
  if (['LK', 'LKS', 'STM', 'BAY', 'RSV', 'LGN', 'FJD', 'SD'].includes(c)) return 'water';
  if (c === 'AIRP') return 'airport';
  return 'geomarker'; // ADM*, RGN, ISL and everything else
}

/** Name country (as the seed wrote it) -> accepted ISO codes, where the geocoder's name differs. */
const COUNTRY_ALIASES = {
  'czech republic': ['CZ'], czechia: ['CZ'], 'united states': ['US'], usa: ['US'],
  'united kingdom': ['GB'], uk: ['GB'], england: ['GB'], scotland: ['GB'], wales: ['GB'],
  turkey: ['TR'], china: ['CN', 'HK', 'MO'], switzerland: ['CH'], schweiz: ['CH'],
};

const CANTONS = new Set([
  'ag', 'ai', 'ar', 'be', 'bl', 'bs', 'fr', 'ge', 'gl', 'gr', 'ju', 'lu', 'ne',
  'nw', 'ow', 'sg', 'sh', 'so', 'sz', 'tg', 'ti', 'ur', 'vd', 'vs', 'zg', 'zh',
]);

/**
 * Hand decisions for rows the geocoder cannot settle (no hit near correct stored coordinates,
 * or a hit whose feature code misnames the place — the seed pinned Isabela Island and Lower
 * Zambezi to their airstrips). Doc id -> location_type. Reviewed in the dry-run report
 * (2026-11-19) before --write. Rows with WRONG stored coordinates are never listed here.
 */
const MANUAL_TYPES = {
  'bka__alpe-di-siusi': 'mountain',
  'bka__creux-du-van': 'mountain',
  'bka__hospitalet-de-l-infant': 'city',
  'bka__isola': 'city',                     // stored point = Isola di Capo Rizzuto (Calabria)
  'bka__katavi-national-park-tanzania': 'geomarker',
  'bka__lake-natron-tanzania': 'water',
  'bka__mahale-tanzania': 'geomarker',      // Mahale Mountains National Park
  'bka__oberhofen': 'city',                 // stored point = Oberhofen AG, not Oberhofen am Thunersee
  'bka__parc-ela': 'geomarker',
  'bka__pasikuda-sri-lanka': 'city',
  'bka__porto-venere': 'city',
  'bka__rodi-fiesso': 'city',
  'bka__sils': 'city',                      // stored point = Sils im Engadin
  'bka__sils-maria': 'city',
  'bka__st-antoenien': 'city',
  'bka__yala-sri-lanka': 'geomarker',       // Yala National Park
  'bka__isabela-island-ecuador': 'geomarker', // island; the geocoder hit is its airport
  'bka__lower-zambezi-zambia': 'geomarker',   // national park; the hit is an airstrip
};

function fold(value) {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A stored coordinate pair counts only when both are finite and not the 0/0 placeholder. */
function hasCoords(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// bka diary places — Open-Meteo
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Max distance between the stored coordinates and a geocoder hit to call it «the same place». */
const SAME_PLACE_KM = 5;

async function openMeteo(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '10');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    await sleep(300);
    if (res.ok) return (await res.json())?.results ?? [];
    if (res.status !== 429 && res.status < 500) return [];
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`Open-Meteo failed for '${query}'`);
}

/** «Aarau, Switzerland» -> { place: 'Aarau', country: 'Switzerland' }; no comma -> no country. */
function splitName(name) {
  const canton = /^(.*\S)\s+([A-Za-z]{2})$/.exec(name.trim());
  if (canton && CANTONS.has(canton[2].toLowerCase())) return { place: canton[1], country: 'Switzerland' };
  const segments = name.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return { place: name.trim(), country: undefined };
  return { place: segments.slice(0, -1).join(', '), country: segments[segments.length - 1] };
}

/** Query forms, first the full place, then each '/'- or ','-separated segment, longest first. */
function queryForms(place) {
  const forms = [place];
  const parts = [...new Set(place.split(/[/,]/).map((s) => s.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const part of parts) if (!forms.includes(part)) forms.push(part);
  return forms;
}

function countryMatches(hit, nameCountry) {
  if (!nameCountry) return true;
  const n = fold(nameCountry);
  if (fold(hit.country) === n) return true;
  return (COUNTRY_ALIASES[n] ?? []).includes((hit.country_code ?? '').toUpperCase());
}

function hitSummary(hit, dist) {
  return {
    name: hit.name, country: hit.country, countryCode: hit.country_code,
    featureCode: hit.feature_code, latitude: hit.latitude, longitude: hit.longitude,
    distanceKm: dist === undefined ? undefined : Math.round(dist * 10) / 10,
  };
}

async function classifyDiaryPlace(doc) {
  const d = doc.data();
  if (MANUAL_TYPES[doc.id]) {
    return { id: doc.id, name: d.name, tenants: d.tenants, from: d.type, storedLatitude: d.latitude, storedLongitude: d.longitude,
      action: 'update', to: MANUAL_TYPES[doc.id], manual: true };
  }
  const { place, country } = splitName(d.name ?? '');
  const lat = Number(d.latitude);
  const lon = Number(d.longitude);
  const stored = hasCoords(lat, lon);

  const hits = [];
  for (const q of queryForms(place)) {
    const results = await openMeteo(q);
    hits.push(...results);
    // Stop as soon as a hit sits on the stored coordinates — no need for the fallback forms.
    if (stored && results.some((h) => distanceKm(lat, lon, h.latitude, h.longitude) <= SAME_PLACE_KM)) break;
    if (!stored && results.length) break;
  }

  const base = { id: doc.id, name: d.name, tenants: d.tenants, from: d.type, storedLatitude: d.latitude, storedLongitude: d.longitude };
  if (hits.length === 0) return { ...base, action: 'review', reason: 'no geocoder hit' };

  // The hit the seed used: nearest to the stored coordinates.
  let chosen;
  let chosenDist;
  if (stored) {
    for (const h of hits) {
      const dist = distanceKm(lat, lon, h.latitude, h.longitude);
      if (chosenDist === undefined || dist < chosenDist) { chosen = h; chosenDist = dist; }
    }
  } else {
    chosen = hits.find((h) => countryMatches(h, country)) ?? hits[0];
  }
  const suggestion = hits.find((h) => countryMatches(h, country));

  if (stored && chosenDist > SAME_PLACE_KM) {
    return {
      ...base, action: 'review', reason: `no hit within ${SAME_PLACE_KM} km of the stored coordinates`,
      nearest: hitSummary(chosen, chosenDist),
      suggested: suggestion ? hitSummary(suggestion) : undefined,
    };
  }
  if (!countryMatches(chosen, country)) {
    return {
      ...base, action: 'review', reason: `wrong coordinates: stored point lies in ${chosen.country} (${chosen.name}), name says ${country}`,
      nearest: hitSummary(chosen, chosenDist),
      suggested: suggestion ? hitSummary(suggestion) : undefined,
    };
  }
  return {
    ...base, action: 'update', to: typeFromFeatureCode(chosen.feature_code),
    hit: hitSummary(chosen, chosenDist),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// scs board-meeting venues — swisstopo
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Doc id -> target type, the swisstopo search text, and the name the hit's bold label must
 * equal (case/accent-folded) to be accepted. Tune `query` here when a venue lands in review.
 */
const VENUES = {
  'panoramaweg-uerikon': { to: 'address', query: 'Panoramaweg 1 8713 Uerikon', match: 'Panoramaweg 1 8713 Uerikon', origin: 'address' },
  'restaurant-frohberg': { to: 'business', query: 'Restaurant Frohberg Stäfa', match: 'Restaurant Frohberg', origin: 'gazetteer' },
  'restaurant-obstgarten': { to: 'business', query: 'Restaurant Obstgarten Männedorf', match: 'Restaurant Obstgarten', origin: 'gazetteer' },
  'wirtschaft-salzwaag': { to: 'business', query: 'Salzwaag Stäfa', match: 'Salzwaag', origin: 'gazetteer' },
  'segelclub-staefa': { to: 'business', query: 'Segelclub Stäfa', match: 'Segelclub Stäfa', origin: 'gazetteer' },
  'villa-sunneschy': { to: 'business', query: 'Villa Sunneschy Stäfa', match: 'Villa Sunneschy', origin: 'gazetteer' },
  'sonnenwiessaal': { to: 'business', query: 'Sonnenwiessaal Stäfa', match: 'Sonnenwiessaal', origin: 'gazetteer' },
};

const GEO_ADMIN = 'https://api3.geo.admin.ch/rest/services/api';

function stripTags(html) {
  return (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** The bold part of a SearchServer label: the feature's own name («<b>Restaurant Frohberg</b>»). */
function boldOf(label) {
  return /<b>(.*?)<\/b>/.exec(label ?? '')?.[1]?.trim() ?? '';
}

async function swisstopoSearch(query) {
  const url = new URL(`${GEO_ADMIN}/SearchServer`);
  url.searchParams.set('searchText', query);
  url.searchParams.set('type', 'locations');
  url.searchParams.set('sr', '4326');
  url.searchParams.set('limit', '10');
  const res = await fetch(url);
  await sleep(200);
  if (!res.ok) throw new Error(`swisstopo SearchServer ${res.status} for '${query}'`);
  return ((await res.json())?.results ?? []).map((r) => r.attrs);
}

/** Nearest GWR building entrance within 30 m -> «Strasse Nr, PLZ Ort», else undefined. */
async function nearestGwrAddress(lat, lon) {
  const url = new URL(`${GEO_ADMIN}/MapServer/identify`);
  url.searchParams.set('geometry', `${lon},${lat}`);
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('sr', '4326');
  url.searchParams.set('layers', 'all:ch.bfs.gebaeude_wohnungs_register');
  url.searchParams.set('tolerance', '15');
  url.searchParams.set('mapExtent', `${lon - 0.005},${lat - 0.005},${lon + 0.005},${lat + 0.005}`);
  url.searchParams.set('imageDisplay', '500,500,96');
  url.searchParams.set('returnGeometry', 'true');
  const res = await fetch(url);
  await sleep(200);
  if (!res.ok) return undefined;
  let best;
  for (const r of (await res.json())?.results ?? []) {
    const g = r.geometry;
    const a = r.attributes ?? {};
    const pLon = g?.x ?? g?.points?.[0]?.[0];
    const pLat = g?.y ?? g?.points?.[0]?.[1];
    if (!Number.isFinite(pLat) || !Number.isFinite(pLon) || !a.strname_deinr) continue;
    const dist = distanceKm(lat, lon, pLat, pLon) * 1000;
    if (!best || dist < best.dist) best = { dist, address: `${a.strname_deinr}, ${a.dplz4} ${a.dplzname}`, egaid: a.egaid };
  }
  return best && best.dist <= 30 ? { ...best, dist: Math.round(best.dist) } : undefined;
}

async function classifyVenue(doc) {
  const d = doc.data();
  const v = VENUES[doc.id];
  const base = { id: doc.id, name: d.name, tenants: d.tenants, from: d.type, storedLatitude: d.latitude, storedLongitude: d.longitude };
  if (!v) return { ...base, action: 'review', reason: 'scs location with type address that is not a known meeting venue' };

  const hits = await swisstopoSearch(v.query);
  const candidates = hits.slice(0, 5).map((h) => `${h.origin}: ${stripTags(h.label)} (${h.lat?.toFixed(5)}, ${h.lon?.toFixed(5)})`);
  const want = fold(v.match);
  // An address hit must equal the whole label; a gazetteer hit's own (bold) name must equal `match`.
  const matching = hits.filter((h) => h.origin === v.origin
    && fold(v.origin === 'address' ? stripTags(h.label) : boldOf(h.label)) === want);
  // Several entries for the same building (Gebaeude / Gebaeude Einzelhaus) are one place when within 50 m.
  const distinct = matching.filter((h, i) => matching.findIndex((o) => distanceKm(o.lat, o.lon, h.lat, h.lon) < 0.05) === i);

  const update = { action: 'update', to: v.to };
  if (distinct.length !== 1) {
    return {
      ...base, ...update, coords: 'review',
      reason: distinct.length === 0 ? `no swisstopo hit named «${v.match}»` : `${distinct.length} distinct swisstopo hits named «${v.match}»`,
      candidates,
    };
  }
  const hit = distinct[0];
  const latitude = Math.round(hit.lat * 1e6) / 1e6;
  const longitude = Math.round(hit.lon * 1e6) / 1e6;
  let address;
  if (v.origin === 'address') {
    address = stripTags(hit.label).replace(/^(.*?\S)\s+(\d{4}\s.*)$/, '$1, $2');
  } else {
    address = (await nearestGwrAddress(hit.lat, hit.lon))?.address;
  }
  return { ...base, ...update, coords: 'set', latitude, longitude, address, matched: stripTags(hit.label), candidates };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Dry run: build the plan
// ═══════════════════════════════════════════════════════════════════════════════════════

async function buildPlan() {
  const snap = await db.collection(LOCATIONS).where('type', '==', 'address').get();
  const rows = [];
  let i = 0;
  for (const doc of snap.docs) {
    i++;
    const tenants = doc.data().tenants ?? [];
    if (tenants.includes('bka')) rows.push(await classifyDiaryPlace(doc));
    else if (tenants.includes('scs') && (doc.data().notes ?? '').startsWith('Sitzungsort Vorstand')) rows.push(await classifyVenue(doc));
    else rows.push({ id: doc.id, name: doc.data().name, tenants, from: 'address', action: 'keep', reason: 'not in scope (not bka, not an scs meeting venue)' });
    if (i % 25 === 0) process.stderr.write(`  … ${i}/${snap.size}\n`);
  }
  return { createdAt: new Date().toISOString(), total: snap.size, rows };
}

function printReport(plan) {
  const updates = plan.rows.filter((r) => r.action === 'update');
  const review = plan.rows.filter((r) => r.action === 'review');
  const keep = plan.rows.filter((r) => r.action === 'keep');
  const perType = {};
  for (const r of updates) perType[r.to] = (perType[r.to] ?? 0) + 1;
  const perCode = {};
  for (const r of updates.filter((u) => u.hit)) perCode[`${r.hit.featureCode} -> ${r.to}`] = (perCode[`${r.hit.featureCode} -> ${r.to}`] ?? 0) + 1;

  console.log(`\nlocations with type 'address': ${plan.total}`);
  console.log(`  update: ${updates.length}   review (unchanged): ${review.length}   out of scope: ${keep.length}`);
  console.log('\nper target type:');
  for (const [t, n] of Object.entries(perType).sort((a, b) => b[1] - a[1])) console.log(`  ${t.padEnd(10)} ${n}`);
  console.log('\nper feature code (bka):');
  for (const [c, n] of Object.entries(perCode).sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(22)} ${n}`);

  console.log('\nnon-city reclassifications (bka):');
  for (const r of updates.filter((u) => u.hit && u.to !== 'city')) {
    console.log(`  ${r.to.padEnd(9)} ${r.hit.featureCode.padEnd(5)} ${r.name}  (${r.hit.name}, ${r.hit.distanceKm ?? '?'} km)`);
  }

  console.log('\nmanual decisions (MANUAL_TYPES):');
  for (const r of updates.filter((u) => u.manual)) console.log(`  ${r.to.padEnd(9)} ${r.name}  (${r.storedLatitude}, ${r.storedLongitude})`);

  console.log('\nscs venues:');
  for (const r of plan.rows.filter((x) => x.tenants?.includes('scs'))) {
    const coords = r.coords === 'set' ? `${r.latitude}, ${r.longitude}  ${r.address ?? '(no address)'}  [${r.matched}]` : `COORDS REVIEW: ${r.reason}`;
    console.log(`  ${r.id.padEnd(22)} ${r.from} -> ${r.to}   ${coords}`);
    if (r.coords !== 'set') for (const c of r.candidates ?? []) console.log(`      candidate ${c}`);
  }

  console.log('\nMANUAL REVIEW (type left as address):');
  for (const r of review) {
    console.log(`  ${r.id}  «${r.name}»  stored ${r.storedLatitude}, ${r.storedLongitude}`);
    console.log(`      ${r.reason}`);
    if (r.nearest) console.log(`      nearest hit: ${r.nearest.name}, ${r.nearest.country} [${r.nearest.featureCode}] ${r.nearest.latitude}, ${r.nearest.longitude} (${r.nearest.distanceKm} km)`);
    if (r.suggested) console.log(`      suggested:   ${r.suggested.name}, ${r.suggested.country} [${r.suggested.featureCode}] ${r.suggested.latitude}, ${r.suggested.longitude}`);
  }
  for (const r of keep) console.log(`  out of scope: ${r.id} «${r.name}» ${r.tenants}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// --write: apply the reviewed plan
// ═══════════════════════════════════════════════════════════════════════════════════════

async function applyPlan(plan) {
  let updated = 0;
  let skipped = 0;
  for (const r of plan.rows.filter((x) => x.action === 'update')) {
    const ref = db.collection(LOCATIONS).doc(r.id);
    const snap = await ref.get();
    const cur = snap.data();
    if (!snap.exists || cur.type !== 'address' || cur.name !== r.name) {
      console.log(`  skip ${r.id}: changed since the plan (type=${cur?.type}, name=${cur?.name})`);
      skipped++;
      continue;
    }
    const patch = { type: r.to };
    if (r.coords === 'set') {
      patch.latitude = r.latitude;
      patch.longitude = r.longitude;
      if (r.address && !cur.address) patch.address = r.address;
    }
    await ref.update(patch);
    updated++;
  }
  console.log(`\nwritten: ${updated} updated, ${skipped} skipped.`);
}

if (isWrite) {
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  console.log(`Applying plan from ${plan.createdAt} (${plan.rows.length} rows) …`);
  await applyPlan(plan);
} else {
  console.log('DRY RUN — reading Firestore and geocoding, nothing is written to Firestore.');
  const plan = await buildPlan();
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  printReport(plan);
  console.log(`\nplan written to ${planPath}. Review it, then re-run with --write --plan=${planPath}.`);
}
process.exit(0);
