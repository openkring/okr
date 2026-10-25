/**
 * Picks the avatar picture of a location from the coats of arms in Storage under `general/`:
 *   1. the Gemeinde's Wappen  (`general/gemeinden/<kanton>/<datei>`, via registry.csv — by PLZ, then by name)
 *   2. its canton             (`general/kantone/<kanton>.svg`) — or its Bundesland for Germany
 *                             (`general/deutschland_bundeslaender/<land>.svg`)
 *   3. its country            (`general/laender/<land>.svg`)
 * Nothing found → no avatar; the app then shows its default icon.
 *
 * The result is stored as a shared avatar doc `avatars/location.<okey>` (tenants ['system']), the
 * bare id every tenant's AvatarService falls back to. A hand-uploaded picture is never replaced:
 * only docs whose storagePath lies under `general/` count as generated.
 *
 * Pure: no firebase imports, no @okr imports — scripts/backfill-location-avatars.ts runs this file
 * under ts-node, which does not resolve the @okr path map.
 */

export const LOCATION_AVATAR_ROOT = 'general/';
export const GEMEINDEN_DIR = 'general/gemeinden/';
export const KANTONE_DIR = 'general/kantone/';
export const BUNDESLAENDER_DIR = 'general/deutschland_bundeslaender/';
export const LAENDER_DIR = 'general/laender/';
export const GEMEINDE_REGISTRY_PATH = `${GEMEINDEN_DIR}registry.csv`;

/** One Gemeinde from registry.csv, with the one coat of arms chosen for it (see parseGemeindeRegistry). */
export interface GemeindeRow {
  kanton: string; // lower-case canton code, e.g. 'zh'
  plz: string;
  names: string[]; // gemeinde + name_alpenfahnen, split at '/' (Biel/Bienne), without '(…)'
  path: string; // full storage path
}

export interface LocationAvatarCatalog {
  byPlz: Map<string, GemeindeRow[]>;
  byName: Map<string, GemeindeRow[]>;
  /** the parts of hyphenated names (Rapperswil-Jona → rapperswil, jona); consulted only when byName finds nothing */
  byPart: Map<string, GemeindeRow[]>;
  /** every storage path that exists below `general/` (kantone, bundeslaender, laender) */
  files: Set<string>;
}

export interface LocationLike {
  name?: string;
  address?: string;
}

const CANTONS = new Set([
  'ag', 'ai', 'ar', 'be', 'bl', 'bs', 'fr', 'ge', 'gl', 'gr', 'ju', 'lu', 'ne',
  'nw', 'ow', 'sg', 'sh', 'so', 'sz', 'tg', 'ti', 'ur', 'vd', 'vs', 'zg', 'zh',
]);

/** Canton names (de / fr / it / en) → code: the canton when its capital has no own Wappen (Luzern). */
const CANTON_NAMES: Record<string, string> = {
  'aargau': 'ag', 'appenzell innerrhoden': 'ai', 'appenzell ausserrhoden': 'ar', 'bern': 'be', 'berne': 'be',
  'basel landschaft': 'bl', 'basel land': 'bl', 'basel stadt': 'bs', 'basel': 'bs', 'fribourg': 'fr', 'freiburg': 'fr',
  'geneve': 'ge', 'genf': 'ge', 'geneva': 'ge', 'glarus': 'gl', 'graubuenden': 'gr', 'graubunden': 'gr', 'grisons': 'gr',
  'jura': 'ju', 'luzern': 'lu', 'lucerne': 'lu', 'neuchatel': 'ne', 'neuenburg': 'ne', 'nidwalden': 'nw',
  'obwalden': 'ow', 'st gallen': 'sg', 'sankt gallen': 'sg', 'schaffhausen': 'sh', 'solothurn': 'so', 'schwyz': 'sz',
  'thurgau': 'tg', 'ticino': 'ti', 'tessin': 'ti', 'uri': 'ur', 'vaud': 'vd', 'waadt': 'vd', 'valais': 'vs',
  'wallis': 'vs', 'zug': 'zg', 'zuerich': 'zh', 'zurich': 'zh',
};

/** English (and other) exonyms Google uses → the registry's name. */
const EXONYMS: Record<string, string> = {
  'geneva': 'genève', 'lucerne': 'luzern', 'berne': 'bern', 'basle': 'basel', 'st gall': 'st. gallen',
};

/**
 * A bare name that usually means a merged Gemeinde rather than the namesake elsewhere:
 * 'Rapperswil' on Lake Zurich is Rapperswil-Jona SG, not Rapperswil BE. A canton code
 * ('Rapperswil BE') bypasses this.
 */
const PREFERRED: Record<string, string> = {
  'rapperswil': 'rapperswil-jona',
};

const SWITZERLAND = 'schweiz';
const GERMANY = 'deutschland';

/** Bundesland (German and English names) → file name in general/deutschland_bundeslaender. */
const BUNDESLAENDER: Record<string, string> = {
  'baden-württemberg': 'badenwuertemberg', 'baden-wuerttemberg': 'badenwuertemberg',
  'bayern': 'bayern', 'bavaria': 'bayern',
  'berlin': 'berlin',
  'brandenburg': 'brandenburg',
  'bremen': 'bremen',
  'hamburg': 'hamburg',
  'hessen': 'hessen', 'hesse': 'hessen',
  'mecklenburg-vorpommern': 'mecklenburgVorpommern', 'mecklenburg-western pomerania': 'mecklenburgVorpommern',
  'niedersachsen': 'niedersachsen', 'lower saxony': 'niedersachsen',
  'nordrhein-westfalen': 'nordrheinWestfalen', 'north rhine-westphalia': 'nordrheinWestfalen',
  'rheinland-pfalz': 'rheinlandPfalz', 'rhineland-palatinate': 'rheinlandPfalz',
  'saarland': 'saarland',
  'sachsen': 'sachsen', 'saxony': 'sachsen',
  'sachsen-anhalt': 'sachsenAnhalt', 'saxony-anhalt': 'sachsenAnhalt',
  'schleswig-holstein': 'schleswigholstein',
  'thüringen': 'thueringen', 'thueringen': 'thueringen', 'thuringia': 'thueringen',
};

/**
 * Country name as Google writes it (English) → file name in general/laender. A German name that
 * equals the file name ('Schweiz', 'Österreich') is found without an entry (see countryFile).
 */
const COUNTRIES: Record<string, string> = {
  'switzerland': 'schweiz', 'germany': 'deutschland', 'austria': 'oesterreich', 'liechtenstein': 'liechtenstein',
  'france': 'frankreich', 'italy': 'italien', 'spain': 'spanien', 'portugal': 'portugal',
  'united kingdom': 'uk', 'uk': 'uk', 'great britain': 'uk', 'england': 'uk', 'scotland': 'uk', 'wales': 'uk',
  'ireland': 'irland', 'iceland': 'island', 'netherlands': 'niederlande', 'the netherlands': 'niederlande',
  'belgium': 'belgien', 'luxembourg': 'luxemburg', 'monaco': 'monaco', 'andorra': 'andorra',
  'san marino': 'sanmarino', 'vatican city': 'vatikan', 'malta': 'malta', 'cyprus': 'zypern',
  'denmark': 'daenemark', 'norway': 'norwegen', 'sweden': 'schweden', 'finland': 'finnland',
  'estonia': 'estland', 'latvia': 'lettland', 'lithuania': 'litauen', 'poland': 'polen',
  'czechia': 'tschechien', 'czech republic': 'tschechien', 'slovakia': 'slowakei', 'hungary': 'ungarn',
  'slovenia': 'slowenien', 'croatia': 'kroatien', 'bosnia and herzegovina': 'bosnienHerzegovina',
  'serbia': 'serbien', 'montenegro': 'montenegro', 'kosovo': 'kosovo', 'albania': 'albanien',
  'north macedonia': 'nordmazedonien', 'greece': 'griechenland', 'bulgaria': 'bulgarien', 'romania': 'rumaenien',
  'moldova': 'moldau', 'ukraine': 'ukraine', 'belarus': 'weissrussland', 'russia': 'russland',
  'turkey': 'tuerkei', 'türkiye': 'tuerkei', 'georgia': 'georgien', 'armenia': 'armenien', 'azerbaijan': 'aserbaidschan',
  'united states': 'usa', 'united states of america': 'usa', 'usa': 'usa', 'canada': 'kanada', 'mexico': 'mexiko',
  'guatemala': 'guatemala', 'belize': 'belize', 'honduras': 'honduras', 'el salvador': 'elsalvador',
  'nicaragua': 'nicaragua', 'costa rica': 'costarica', 'panama': 'panama', 'cuba': 'kuba', 'jamaica': 'jamaika',
  'haiti': 'haiti', 'dominican republic': 'dominikanischeRepublik', 'bahamas': 'bahamas', 'barbados': 'barbados',
  'trinidad and tobago': 'trinidadTobago', 'colombia': 'kolumbien', 'venezuela': 'venezuela', 'ecuador': 'ecuador',
  'peru': 'peru', 'bolivia': 'bolivien', 'brazil': 'brasilien', 'chile': 'chile', 'argentina': 'argentinien',
  'uruguay': 'uruguay', 'paraguay': 'paraguay', 'guyana': 'guyana', 'suriname': 'surinam',
  'morocco': 'marokko', 'algeria': 'algerien', 'tunisia': 'tunesien', 'libya': 'libyen', 'egypt': 'aegypten',
  'sudan': 'sudan', 'south sudan': 'suedsudan', 'ethiopia': 'aethiopien', 'eritrea': 'eritrea', 'djibouti': 'dschibuti',
  'somalia': 'somalia', 'kenya': 'kenia', 'uganda': 'uganda', 'rwanda': 'ruanda', 'burundi': 'burundi',
  'tanzania': 'tansania', 'zambia': 'sambia', 'zimbabwe': 'simbabwe', 'malawi': 'malawi', 'mozambique': 'mosambique',
  'madagascar': 'madagascar', 'mauritius': 'mauritius', 'seychelles': 'seychellen', 'south africa': 'suedafrika',
  'namibia': 'namibia', 'botswana': 'botswana', 'lesotho': 'lesotho', 'eswatini': 'eswatini', 'angola': 'angola',
  'ghana': 'ghana', 'nigeria': 'nigeria', 'senegal': 'senegal', 'gambia': 'gambia', 'mali': 'mali', 'niger': 'niger',
  'cameroon': 'kamerun', 'gabon': 'gabun', 'cape verde': 'kapverde', 'ivory coast': 'elfenbeinkueste',
  "côte d'ivoire": 'elfenbeinkueste', 'israel': 'israel', 'palestine': 'palaestina', 'jordan': 'jordanien',
  'lebanon': 'libanon', 'syria': 'syrien', 'iraq': 'irak', 'iran': 'iran', 'saudi arabia': 'saudiarabien',
  'yemen': 'jemen', 'oman': 'oman', 'qatar': 'katar', 'bahrain': 'bahrain', 'kuwait': 'kuwait',
  'kazakhstan': 'kasachstan', 'uzbekistan': 'usbekistan', 'kyrgyzstan': 'kirgistan', 'tajikistan': 'tadschikistan',
  'turkmenistan': 'turkmenistan', 'afghanistan': 'afghanistan', 'pakistan': 'pakistan', 'india': 'indien',
  'nepal': 'nepal', 'bhutan': 'bhutan', 'bangladesh': 'bangladesh', 'sri lanka': 'srilanka', 'maldives': 'malediven',
  'myanmar': 'myanmar', 'thailand': 'thailand', 'laos': 'laos', 'cambodia': 'kambodscha', 'vietnam': 'vietnam',
  'malaysia': 'malaysia', 'singapore': 'singapur', 'indonesia': 'indonesien', 'philippines': 'philippinien',
  'brunei': 'brunei', 'timor-leste': 'osttimor', 'china': 'china', 'taiwan': 'taiwan', 'mongolia': 'mongolei',
  'japan': 'japan', 'south korea': 'suedkorea', 'north korea': 'nordkorea', 'australia': 'australien',
  'new zealand': 'neuseeland', 'papua new guinea': 'papuaNeuguinea', 'fiji': 'fidji', 'samoa': 'samoa', 'tonga': 'tonga',
};

/** Lower case, umlauts as ae/oe/ue, other accents dropped, punctuation folded to single spaces. */
export function normaliseName(value: string): string {
  return foldAccents(value.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'));
}

/** Like normaliseName, but umlauts lose their dots ('Zürich' → 'zurich', as Google writes it in English). */
function plainName(value: string): string {
  return foldAccents(value.toLowerCase());
}

function foldAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function nameKeys(value: string): string[] {
  const exonym = EXONYMS[plainName(value)];
  const values = exonym ? [value, exonym] : [value];
  return [...new Set(values.flatMap((v) => [normaliseName(v), plainName(v)]))].filter(Boolean);
}

/*-------------------------- catalog --------------------------------*/

/** Lower is better: no variant, then the new coat of arms, then anything but the old one. */
function variantRank(variante: string): number {
  if (!variante) return 0;
  if (/neu/i.test(variante)) return 1;
  if (/\balt/i.test(variante)) return 3;
  return 2;
}

function splitNames(value: string): string[] {
  return value.split('/').map((n) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim()).filter(Boolean);
}

/**
 * Parses registry.csv (`kanton,plz,gemeinde,variante,name_alpenfahnen,datei,quelle_url`, no quoting).
 * A Gemeinde (kanton + plz + gemeinde) may have several files — an old and a new coat of arms
 * (Stäfa has only the two variants), or a `_2` duplicate (Payerne); it keeps exactly one, so the
 * lookup never sees it as ambiguous.
 */
export function parseGemeindeRegistry(csv: string): GemeindeRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const header = (lines.shift() ?? '').split(',');
  const col = (name: string) => header.indexOf(name);
  const [iKanton, iPlz, iGemeinde, iVariante, iAlias, iDatei] =
    ['kanton', 'plz', 'gemeinde', 'variante', 'name_alpenfahnen', 'datei'].map(col);
  const best = new Map<string, { rank: number; row: GemeindeRow }>();
  for (const line of lines) {
    const f = line.split(',').map((v) => (v ?? '').trim());
    if (!f[iDatei] || !f[iGemeinde]) continue;
    const key = `${f[iKanton]}|${f[iPlz]}|${f[iGemeinde]}`;
    const rank = variantRank(f[iVariante]);
    const current = best.get(key);
    if (current && current.rank <= rank) continue;
    // name_alpenfahnen of a variant row carries the variant ('Stäfa (neues Wappen)'): splitNames drops it
    best.set(key, {
      rank,
      row: {
        kanton: f[iKanton].toLowerCase(),
        plz: f[iPlz],
        names: [...new Set([...splitNames(f[iGemeinde]), ...splitNames(f[iAlias])])],
        path: GEMEINDEN_DIR + f[iDatei],
      },
    });
  }
  return [...best.values()].map((b) => b.row);
}

export function buildCatalog(rows: GemeindeRow[], files: Iterable<string>): LocationAvatarCatalog {
  const byPlz = new Map<string, GemeindeRow[]>();
  const byName = new Map<string, GemeindeRow[]>();
  const byPart = new Map<string, GemeindeRow[]>();
  const add = (map: Map<string, GemeindeRow[]>, key: string, row: GemeindeRow) => {
    const list = map.get(key) ?? [];
    if (!list.includes(row)) list.push(row);
    map.set(key, list);
  };
  for (const row of rows) {
    if (row.plz) add(byPlz, row.plz, row);
    for (const name of row.names) {
      for (const key of nameKeys(name)) add(byName, key, row);
      const parts = name.split('-').map((x) => x.trim());
      if (parts.length > 1) {
        for (const part of parts.filter((x) => x.length >= 4)) for (const key of nameKeys(part)) add(byPart, key, row);
      }
    }
  }
  return { byPlz, byName, byPart, files: new Set(files) };
}

/*-------------------------- parsing --------------------------------*/

export interface ParsedLocation {
  country?: string; // file name in general/laender, e.g. 'schweiz'
  plz?: string;
  city?: string; // the place the PLZ belongs to, or the first segment
  canton?: string; // from a trailing canton code: 'Buchs SG'
  bundesland?: string; // file name in general/deutschland_bundeslaender
}

function countryFile(segment: string): string | undefined {
  const key = segment.trim().toLowerCase();
  if (COUNTRIES[key]) return COUNTRIES[key];
  const asFile = normaliseName(segment).replace(/ /g, '');
  return Object.values(COUNTRIES).find((f) => f.toLowerCase() === asFile);
}

/** Reads country, PLZ, place, canton code and Bundesland from 'Seestrasse 214, 8713 Stäfa, Switzerland'. */
export function parseLocationText(text: string): ParsedLocation {
  const segments = text.split(',').map((s) => s.trim()).filter(Boolean);
  const result: ParsedLocation = {};
  if (segments.length > 1) {
    const country = countryFile(segments[segments.length - 1]);
    if (country) {
      result.country = country;
      segments.pop();
    }
  }
  for (const segment of segments) {
    const land = BUNDESLAENDER[segment.toLowerCase()];
    if (land && !result.bundesland) result.bundesland = land;
    const m = /^(?:(?:CH|D|DE)-)?(\d{4,5})\s+(.+)$/i.exec(segment);
    if (m && !result.plz) {
      result.plz = m[1];
      result.city = m[2].trim();
    }
  }
  if (!result.city && segments.length) result.city = segments[0];
  if (result.city) {
    const code = /^(.+?)\s+([A-Z]{2})$/.exec(result.city);
    if (code && CANTONS.has(code[2].toLowerCase())) {
      result.city = code[1].trim();
      result.canton = code[2].toLowerCase();
    }
  }
  return result;
}

/*-------------------------- resolving --------------------------------*/

function nameMatches(row: GemeindeRow, city: string): boolean {
  const keys = nameKeys(city);
  return row.names.some((n) => nameKeys(n).some((k) => keys.includes(k)));
}

function onlyOne(rows: GemeindeRow[]): GemeindeRow | undefined {
  const paths = new Set(rows.map((r) => r.path));
  return paths.size === 1 ? rows[0] : undefined;
}

function sameCanton(rows: GemeindeRow[]): string | undefined {
  const cantons = new Set(rows.map((r) => r.kanton));
  return cantons.size === 1 ? rows[0].kanton : undefined;
}

/** How specific a picture is: a Gemeinde beats a canton/Bundesland beats a country. */
type Rank = 3 | 2 | 1;
interface Hit {
  path: string;
  rank: Rank;
}

function resolveParsed(p: ParsedLocation, catalog: LocationAvatarCatalog): Hit | undefined {
  const exists = (path: string, rank: Rank): Hit | undefined => (catalog.files.has(path) ? { path, rank } : undefined);
  const foreign = !!p.country && p.country !== SWITZERLAND;

  if (!foreign) {
    let canton = p.canton;
    const plzRows = p.plz ? (catalog.byPlz.get(p.plz) ?? []).filter((r) => !canton || r.kanton === canton) : [];
    const plzNameRows = p.city ? plzRows.filter((r) => nameMatches(r, p.city as string)) : [];
    // PLZ + place agree: certain. PLZ alone: only when the country says Switzerland.
    const byPlz = onlyOne(plzNameRows) ?? (p.country === SWITZERLAND ? onlyOne(plzRows) : undefined);
    if (byPlz) return { path: byPlz.path, rank: 3 };

    const lookup = (index: Map<string, GemeindeRow[]>, name = p.city) => name
      ? nameKeys(name).flatMap((k) => index.get(k) ?? []).filter((r) => !canton || r.kanton === canton)
      : [];
    // An exact name wins ('Martigny' is the town, not Martigny-Combe); a part of a hyphenated name
    // ('Jona') only when no Gemeinde carries the name itself.
    const preferred = !canton && p.city ? PREFERRED[plainName(p.city)] : undefined;
    let nameRows = preferred ? lookup(catalog.byName, preferred) : lookup(catalog.byName);
    if (!nameRows.length) nameRows = lookup(catalog.byPart);
    const byName = onlyOne(nameRows);
    if (byName) return { path: byName.path, rank: 3 };
    const cantonByName = p.city ? CANTON_NAMES[plainName(p.city)] : undefined;

    const swiss = p.country === SWITZERLAND || !!canton || plzNameRows.length > 0;
    if (swiss) {
      canton = canton ?? sameCanton(plzNameRows) ?? sameCanton(plzRows) ?? sameCanton(nameRows) ?? cantonByName;
      const hit = canton ? exists(`${KANTONE_DIR}${canton}.svg`, 2) : undefined;
      return hit ?? exists(`${LAENDER_DIR}${SWITZERLAND}.svg`, 1);
    }
  }

  if (p.bundesland && (!p.country || p.country === GERMANY)) {
    return exists(`${BUNDESLAENDER_DIR}${p.bundesland}.svg`, 2) ?? exists(`${LAENDER_DIR}${GERMANY}.svg`, 1);
  }
  return p.country ? exists(`${LAENDER_DIR}${p.country}.svg`, 1) : undefined;
}

/**
 * The storage path of the location's avatar picture, or undefined when nothing fits.
 * Address and name are read separately (bka names are 'Aarau, Switzerland', scs addresses
 * 'Seestrasse 214, 8713 Stäfa, Switzerland') and the most specific picture wins; on a tie the
 * address wins. The name's place is also tried with the address's country.
 * A Gemeinde name shared by several Gemeinden (Buchs AG / SG / ZH) only resolves when a PLZ or a
 * canton code tells them apart — a wrong coat of arms is worse than the canton's.
 */
export function resolveLocationAvatarPath(location: LocationLike, catalog: LocationAvatarCatalog): string | undefined {
  const fromAddress = parseLocationText(location.address ?? '');
  const fromName = parseLocationText(location.name ?? '');
  const candidates = [fromAddress, fromName];
  if (!fromName.country && fromAddress.country) candidates.push({ ...fromName, country: fromAddress.country });
  let best: Hit | undefined;
  for (const parsed of candidates) {
    const hit = resolveParsed(parsed, catalog);
    if (hit && (!best || hit.rank > best.rank)) best = hit;
  }
  return best?.path;
}

/*-------------------------- planning the write --------------------------------*/

export interface ExistingAvatar {
  storagePath?: string;
}

export type LocationAvatarAction =
  | { kind: 'set'; storagePath: string }
  | { kind: 'delete' }
  | { kind: 'skip' };

export function isGeneratedAvatar(avatar: ExistingAvatar | undefined): boolean {
  return !!avatar?.storagePath?.startsWith(LOCATION_AVATAR_ROOT);
}

/**
 * What to do with `avatars/location.<okey>`: a hand-uploaded picture always stays; a generated
 * one follows the location (removed when the location is deleted or no longer resolves).
 */
export function planLocationAvatar(
  location: LocationLike | undefined,
  existing: ExistingAvatar | undefined,
  catalog: LocationAvatarCatalog,
): LocationAvatarAction {
  if (existing && !isGeneratedAvatar(existing)) return { kind: 'skip' };
  const path = location ? resolveLocationAvatarPath(location, catalog) : undefined;
  if (!path) return existing ? { kind: 'delete' } : { kind: 'skip' };
  return existing?.storagePath === path ? { kind: 'skip' } : { kind: 'set', storagePath: path };
}

export function locationAvatarDocId(locationKey: string): string {
  return `location.${locationKey}`;
}
