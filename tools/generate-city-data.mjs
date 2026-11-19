// Generator for the postal-code city datasets used by `okr-city-search`.
//
// Sources:
// - CH and LI: the official swisstopo locality list (Amtliches Ortschaftenverzeichnis,
//   https://www.swisstopo.admin.ch/de/amtliches-ortschaftenverzeichnis), open data.
//   It is the register the swisstopo address search (spec 1.164) answers from, so
//   locality names and postcodes match the addresses picked there exactly.
// - all other countries: GeoNames postal codes (https://download.geonames.org/export/zip/),
//   licensed CC BY 4.0 — the app must credit GeoNames (see the search popover).
//
// Writes one minified JSON file per country to OUT_DIR, each an array of
// `City` (libs/shared/models/src/lib/city.model.ts):
//   { zipCode, name, stateCode, countryCode,
//     municipality?, municipalityCode?, district?, latitude?, longitude? }
// CH/LI carry the municipality with its BFS number (no district: the register has
// none, and GeoNames' Swiss district names mix languages). AT carries municipality
// (Gemeindekennziffer) and district from GeoNames. In DE/FR/IT/GB/US the GeoNames
// admin levels are districts or regions, not municipalities, so those files carry
// coordinates only.
//
// Run: `node tools/generate-city-data.mjs [CC ...]`  (default: all COUNTRIES)
// Requires Node >= 18 (global fetch) and `unzip` on PATH.
// Re-run at least once a year after 1 January (Swiss municipality mergers).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COUNTRIES = ['CH', 'LI', 'DE', 'AT', 'IT', 'FR', 'US', 'GB'];
const SWISSTOPO_COUNTRIES = new Set(['CH', 'LI']); // both written from the one swisstopo file
const BASE = 'https://download.geonames.org/export/zip';
const SWISSTOPO_URL = 'https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_4326.csv.zip';
const OUT_DIR = 'libs/subject/swisscities/ui/src/assets/cities';

// GeoNames postal-code columns (tab separated, see export/zip/readme.txt)
const COL = {
  country: 0, zip: 1, place: 2,
  admin1Name: 3, admin1Code: 4, admin2Name: 5, admin2Code: 6, admin3Name: 7, admin3Code: 8,
  lat: 9, lng: 10, accuracy: 11,
};

// GeoNames uses a short code as admin1 code for these countries; elsewhere it is
// numeric (AT "03", IT "09" …), so the readable name is kept as stateCode.
const ADMIN1_CODE_COUNTRIES = new Set(['DE', 'US', 'GB']);

// Where the municipality (and the district above it) lives in GeoNames' admin levels.
const MUNICIPALITY = {
  AT: { name: COL.admin3Name, code: COL.admin3Code, district: COL.admin2Name },
};

// DE/AT: large-customer and PO-box postcodes carry a company name or "Postfach"
// instead of a place. Not applied elsewhere: "Bank" or "Service" are place-name
// words in GB/US.
const COMPANY_FILTER = new Set(['DE', 'AT']);
const COMPANY = /\b(GmbH|mbH|AG|SE|KG|KGaA|OHG|e\.\s?V\.)\b|Versicherung|Sparkasse|Verlag|Service|Postfach|Kundenzentrum/;

/** Downloads a zip and returns the text of one file inside it. */
async function downloadZipEntry(url, entry, tag) {
  const work = mkdtempSync(join(tmpdir(), `citygen-${tag}-`));
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${url} failed: ${res.status}`);
    const zipPath = join(work, 'data.zip');
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    execFileSync('unzip', ['-o', '-q', '-j', zipPath, entry, '-d', work]);
    return readFileSync(join(work, entry.split('/').pop()), 'utf8');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** @returns {Promise<string[][]>} */
async function downloadGeoNames(cc) {
  const text = await downloadZipEntry(`${BASE}/${cc}.zip`, `${cc}.txt`, cc);
  return text.trim().split('\n').map((l) => l.split('\t'));
}

/**
 * The swisstopo register lists a locality once per municipality it reaches into,
 * with that municipality's share of its addresses ("Adressenanteil"). The locality
 * is kept once, with the municipality (and its centroid) holding the largest share.
 * BFS numbers 7001–7011 are the municipalities of Liechtenstein (no canton).
 * @returns {Promise<Record<'CH'|'LI', object[]>>}
 */
async function buildSwisstopo() {
  const text = await downloadZipEntry(SWISSTOPO_URL, 'AMTOVZ_CSV_WGS84/AMTOVZ_CSV_WGS84.csv', 'swisstopo');
  const [header, ...lines] = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split('\n');
  const h = header.split(';');
  const col = (name) => {
    const i = h.indexOf(name);
    if (i < 0) throw new Error(`swisstopo CSV: column ${name} missing (header: ${header})`);
    return i;
  };
  const C = {
    name: col('Ortschaftsname'), zip: col('PLZ4'), zipId: col('ZIP_ID'), municipality: col('Gemeindename'),
    bfs: col('BFS-Nr'), canton: col('Kantonskürzel'), share: col('Adressenanteil'), e: col('E'), n: col('N'),
  };
  const best = new Map();
  for (const line of lines) {
    const r = line.split(';');
    const share = Number.parseFloat(r[C.share]);
    const prev = best.get(r[C.zipId]);
    if (!prev || share > prev.share) best.set(r[C.zipId], { r, share });
  }
  const out = { CH: [], LI: [] };
  for (const { r } of best.values()) {
    const cc = r[C.canton] ? 'CH' : 'LI';
    const city = {
      zipCode: r[C.zip], name: r[C.name], stateCode: r[C.canton], countryCode: cc,
      municipality: r[C.municipality], municipalityCode: r[C.bfs],
    };
    const lat = round(r[C.n]);
    const lng = round(r[C.e]);
    if (lat !== undefined && lng !== undefined) Object.assign(city, { latitude: lat, longitude: lng });
    out[cc].push(city);
  }
  console.log(`swisstopo: ${lines.length} rows, ${best.size} localities`);
  return out;
}

function keep(cc, r) {
  if (COMPANY_FILTER.has(cc) && COMPANY.test(r[COL.place])) return false;
  return true;
}

function round(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : undefined;
}

function toCity(cc, r) {
  const city = {
    zipCode: r[COL.zip],
    name: r[COL.place],
    stateCode: ADMIN1_CODE_COUNTRIES.has(cc) ? r[COL.admin1Code] : r[COL.admin1Name],
    countryCode: cc,
  };
  const m = MUNICIPALITY[cc];
  const optional = {
    municipality: m ? r[m.name] : undefined,
    municipalityCode: m ? r[m.code] : undefined,
    district: m?.district !== undefined ? r[m.district] : undefined,
    latitude: round(r[COL.lat]),
    longitude: round(r[COL.lng]),
  };
  for (const [k, v] of Object.entries(optional)) if (v !== undefined && v !== '') city[k] = v;
  return city;
}

const countries = process.argv.length > 2 ? process.argv.slice(2).map((c) => c.toUpperCase()) : COUNTRIES;
mkdirSync(OUT_DIR, { recursive: true });

const byZipThenName = (a, b) => a.zipCode.localeCompare(b.zipCode) || a.name.localeCompare(b.name);
const unknown = countries.filter((cc) => !COUNTRIES.includes(cc));
if (unknown.length) throw new Error(`unsupported countries: ${unknown.join(', ')}`);

if (countries.some((cc) => SWISSTOPO_COUNTRIES.has(cc))) {
  const swiss = await buildSwisstopo();
  for (const cc of countries.filter((c) => SWISSTOPO_COUNTRIES.has(c))) {
    const cities = swiss[cc].sort(byZipThenName);
    writeFileSync(join(OUT_DIR, `${cc}.json`), JSON.stringify(cities));
    console.log(`${cc}: ${cities.length} entries (swisstopo)`);
  }
}

for (const cc of countries.filter((c) => !SWISSTOPO_COUNTRIES.has(c))) {
  const rows = await downloadGeoNames(cc);
  // one entry per zip + name; on duplicates keep the most precise row
  const best = new Map();
  let dropped = 0;
  for (const r of rows) {
    if (!keep(cc, r)) { dropped++; continue; }
    const key = `${r[COL.zip]}|${r[COL.place].toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || Number(r[COL.accuracy] || 0) > Number(prev[COL.accuracy] || 0)) best.set(key, r);
  }
  const cities = [...best.values()]
    .map((r) => toCity(cc, r))
    .sort(byZipThenName);
  writeFileSync(join(OUT_DIR, `${cc}.json`), JSON.stringify(cities));
  console.log(`${cc}: ${cities.length} entries (${rows.length} rows, ${dropped} dropped, ${rows.length - dropped - cities.length} duplicates)`);
}
