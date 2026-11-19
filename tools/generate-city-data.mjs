// One-off generator: downloads zauberware/GeoNames postal data per country,
// maps to the minimal City shape { zipCode, name, stateCode, countryCode },
// and writes minified JSON assets. Run: `node tools/generate-city-data.mjs`
// Requires Node >= 18 (global fetch) and `unzip` on PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COUNTRIES = ['DE', 'AT', 'IT', 'FR', 'US', 'GB'];
const BASE = 'https://raw.githubusercontent.com/zauberware/postal-codes-json-xml-csv/master/data';
const OUT_DIR = 'libs/subject/swisscities/ui/src/assets/cities';

// DE: map GeoNames state name -> 2-letter Bundesland code (EN + DE spellings).
const DE_STATE = {
  'Baden-Württemberg': 'BW', 'Bayern': 'BY', 'Bavaria': 'BY', 'Berlin': 'BE',
  'Brandenburg': 'BB', 'Bremen': 'HB', 'Hamburg': 'HH', 'Hessen': 'HE', 'Hesse': 'HE',
  'Mecklenburg-Vorpommern': 'MV', 'Mecklenburg-Western Pomerania': 'MV',
  'Niedersachsen': 'NI', 'Lower Saxony': 'NI', 'Nordrhein-Westfalen': 'NW',
  'North Rhine-Westphalia': 'NW', 'Rheinland-Pfalz': 'RP', 'Rhineland-Palatinate': 'RP',
  'Saarland': 'SL', 'Sachsen': 'SN', 'Saxony': 'SN', 'Sachsen-Anhalt': 'ST',
  'Saxony-Anhalt': 'ST', 'Schleswig-Holstein': 'SH', 'Thüringen': 'TH', 'Thuringia': 'TH',
};

// GB: map GeoNames nation name -> ONS nation code, used when state_code is missing/unrecognized.
const GB_STATE = {
  England: 'ENG',
  Scotland: 'SCT',
  Wales: 'WLS',
  'Northern Ireland': 'NIR',
};
const GB_CODES = new Set(['ENG', 'SCT', 'WLS', 'NIR']);

function stateCodeFor(cc, row) {
  if (cc === 'DE') {
    return DE_STATE[row.state] ?? DE_STATE[(row.state ?? '').replace(/^Land /, '')] ?? row.state ?? '';
  }
  if (cc === 'US') return row.state_code || row.state || ''; // already alpha
  if (cc === 'GB') {
    if (row.state_code && GB_CODES.has(row.state_code)) return row.state_code;
    return GB_STATE[row.state] ?? '';
  }
  return row.state || ''; // AT/IT/FR: best-effort full name
}

mkdirSync(OUT_DIR, { recursive: true });

for (const cc of COUNTRIES) {
  const work = join(tmpdir(), `citygen-${cc}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const zipPath = join(work, `${cc}.zip`);

  const res = await fetch(`${BASE}/${cc}.zip`);
  if (!res.ok) throw new Error(`download ${cc} failed: ${res.status}`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', work]);

  const raw = JSON.parse(readFileSync(join(work, `zipcodes.${cc.toLowerCase()}.json`), 'utf8'));
  const cities = raw.map((r) => ({
    zipCode: String(r.zipcode),
    name: r.place,
    stateCode: stateCodeFor(cc, r),
    countryCode: cc,
  }));
  writeFileSync(join(OUT_DIR, `${cc}.json`), JSON.stringify(cities));
  console.log(`${cc}: ${cities.length} entries`);
}
