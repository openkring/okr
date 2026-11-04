import { createInterface } from 'node:readline';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';
import JSZip from 'jszip';
import { EnergyFiguresCollection } from '@okr/shared-models';
import type { EnergyTariff } from '@okr/shared-models';
import {
  LOCATION_PROPERTY_BFS_NR, LOCATION_PROPERTY_BFS_STATUS, getBfsNr, getLocationProperty, setLocationProperty,
} from '@okr/shared-util-core';

import {
  CityLocation, ReporterRows, bfsNumbersToFetch, buildEnergyPatch, collectReporterRows, currentBfsFromLookup,
  hasCoordinates, isBlockedByStatus, nextBfsStatus, tariffsFromSparql, tenantsPerBfs, tenantsToSync,
} from './energy.util';

const IDENTIFY_URL = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';
const MUNICIPALITY_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';
const ENERGY_REPORTER_ZIP_URL = 'https://opendata.geoimpact.ch/energiereporter/energyreporter_historized.zip';
const ENERGY_REPORTER_CSV = 'energyreporter_municipality_historized.csv';
const SPARQL_URL = 'https://lindas.admin.ch/query';

/** The location document with the fields the job reads. */
type CityDoc = CityLocation & { name?: string };

/**
 * Tariffs of category H4, product standard, of one municipality. The BFS number is validated as an integer
 * before it is put into the query text, so it cannot carry anything else into the query.
 */
function tariffQuery(bfsNr: number): string {
  if (!Number.isInteger(bfsNr) || bfsNr <= 0) throw new Error(`invalid BFS number ${bfsNr}`);
  return `PREFIX schema: <http://schema.org/>
PREFIX d: <https://energy.ld.admin.ch/elcom/electricityprice/dimension/>
SELECT ?period ?operatorName ?total ?energy ?gridusage ?charge ?aidfee
WHERE {
  ?obs d:municipality <https://ld.admin.ch/municipality/${bfsNr}> ;
       d:category <https://energy.ld.admin.ch/elcom/electricityprice/category/H4> ;
       d:product <https://energy.ld.admin.ch/elcom/electricityprice/product/standard> ;
       d:period ?period ;
       d:operator ?operator ;
       d:total ?total ;
       d:energy ?energy ;
       d:gridusage ?gridusage ;
       d:charge ?charge ;
       d:aidfee ?aidfee .
  ?operator schema:name ?operatorName .
}
ORDER BY ?period ?operatorName`;
}

/**
 * Writes `properties` back to the location, but only when the value of `key` actually changes, so the job
 * does not rewrite unchanged locations every night. A failed write is logged and does not stop the job.
 */
async function setProperty(
  db: admin.firestore.Firestore,
  location: CityDoc,
  key: string,
  value: string | undefined,
): Promise<void> {
  const before = getLocationProperty(location, key);
  if ((before === undefined ? undefined : String(before)) === value) return;
  const properties = setLocationProperty(location.properties, key, value);
  try {
    await db.collection('locations').doc(location.okey).update({ properties });
    location.properties = properties;
  } catch (error) {
    logger.error(`energyFiguresFetch: could not update ${key} of location ${location.okey}`, error);
  }
}

/** Sets or clears the `bfsStatus` of a location through `nextBfsStatus`. */
async function applyStatus(
  db: admin.firestore.Firestore,
  location: CityDoc,
  outcome: 'data' | 'noRow' | 'noMunicipality',
): Promise<void> {
  await setProperty(db, location, LOCATION_PROPERTY_BFS_STATUS, nextBfsStatus(location, outcome));
}

/**
 * Step 2: a city location without a BFS number gets it from its coordinates (a number entered by hand is
 * never touched). No coordinates, or a clean answer without a current row, means `none`. A network error
 * sets nothing: the location is retried tomorrow.
 */
async function fillBfsNumbers(db: admin.firestore.Firestore, locations: CityDoc[]): Promise<void> {
  for (const location of locations) {
    if (getBfsNr(location) !== undefined) continue;
    if (!hasCoordinates(location)) {
      await applyStatus(db, location, 'noMunicipality');
      continue;
    }
    let bfsNr: number | undefined;
    try {
      const { data } = await axios.get<unknown>(IDENTIFY_URL, {
        params: {
          geometry: `${location.longitude},${location.latitude}`,
          geometryType: 'esriGeometryPoint',
          layers: `all:${MUNICIPALITY_LAYER}`,
          sr: 4326,
          geometryFormat: 'geojson',
          tolerance: 0,
          imageDisplay: '1,1,96',
          mapExtent: `${(location.longitude as number) - 0.01},${(location.latitude as number) - 0.01},${(location.longitude as number) + 0.01},${(location.latitude as number) + 0.01}`,
          returnGeometry: false,
        },
        timeout: 20_000,
      });
      bfsNr = currentBfsFromLookup(data);
    } catch (error) {
      logger.error(`energyFiguresFetch: BFS lookup failed for location ${location.okey}`, error);
      continue;
    }
    if (bfsNr === undefined) {
      await applyStatus(db, location, 'noMunicipality');
      continue;
    }
    await setProperty(db, location, LOCATION_PROPERTY_BFS_NR, String(bfsNr));
    await applyStatus(db, location, 'data');
  }
}

/**
 * Step 3: `fetchedAt` (ISO) and `tenants` of all existing documents, not only those with a location, so the
 * tenants of a municipality whose last location is gone can be emptied. Only those two fields are read, the
 * documents are large.
 */
async function readExisting(
  db: admin.firestore.Firestore,
): Promise<{ fetchedAt: Map<number, string>; tenants: Map<number, string[]> }> {
  const fetchedAt = new Map<number, string>();
  const tenants = new Map<number, string[]>();
  const snap = await db.collection(EnergyFiguresCollection).select('fetchedAt', 'tenants').get();
  for (const doc of snap.docs) {
    const bfsNr = Number(doc.id);
    if (!Number.isInteger(bfsNr)) continue;
    const stamp = doc.get('fetchedAt');
    if (typeof stamp === 'string' && stamp !== '') fetchedAt.set(bfsNr, stamp);
    const list = doc.get('tenants');
    tenants.set(bfsNr, Array.isArray(list) ? list.map(String) : []);
  }
  return { fetchedAt, tenants };
}

/**
 * Steps 4 and 5: downloads the ZIP and streams the CSV out of it. The member unpacks to about 28 MB, so
 * it is read line by line and only the wanted rows are kept. A stream that ends early or errors must not
 * count as a complete file: that would write a truncated history, so it throws.
 */
async function readEnergyReporter(wanted: ReadonlySet<number>): Promise<{ found: Map<number, ReporterRows>; failed: Map<number, Error> }> {
  const { data } = await axios.get<ArrayBuffer>(ENERGY_REPORTER_ZIP_URL, { responseType: 'arraybuffer', timeout: 60_000 });
  const zip = await JSZip.loadAsync(data);
  const file = zip.file(ENERGY_REPORTER_CSV);
  if (!file) throw new Error(`Energie Reporter ZIP: ${ENERGY_REPORTER_CSV} not found`);
  const input = file.nodeStream();
  let streamError: Error | undefined;
  let ended = false;
  input.once('error', (error: Error) => { streamError = error; });
  input.once('end', () => { ended = true; });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const result = await collectReporterRows(lines, wanted);
  if (streamError) throw streamError;
  if (!ended) throw new Error('Energie Reporter ZIP: the CSV stream ended before its end');
  return result;
}

/** Step 6: the tariffs of one municipality. Throws on a network error or a non-numeric value. */
async function readTariffs(bfsNr: number): Promise<EnergyTariff[]> {
  const { data } = await axios.post<unknown>(SPARQL_URL, tariffQuery(bfsNr), {
    headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/sparql-query' },
    timeout: 30_000,
  });
  const tariffs = tariffsFromSparql(data);
  // Empty bindings are also what a renamed dimension in the ElCom schema returns: never write them as «no tariffs».
  if (tariffs.length === 0) throw new Error('ElCom returned no tariffs');
  return tariffs;
}

/**
 * Nightly: municipal energy figures (spec 1.136). Fills missing BFS numbers of `city` locations from their
 * coordinates, then, for municipalities whose document is missing or 7 days old (a status-blocked one is retried on Sundays), downloads Energie Reporter
 * and asks ElCom, and writes one `energy-figures` document per BFS number.
 *
 * Each municipality and each source fails alone. A failed source keeps its previous values and the other
 * source's new values are still written; `fetchedAt` moves only when both succeeded, so the failed source
 * is retried the next night.
 */
export async function runEnergyFiguresFetch(): Promise<void> {
  const db = admin.firestore();
  const now = new Date();

  const snap = await db.collection('locations').where('isArchived', '==', false).where('type', '==', 'city').get();
  const locations: CityDoc[] = snap.docs.map((d) => ({ ...(d.data() as CityDoc), okey: d.id }));

  await fillBfsNumbers(db, locations);

  const tenants = tenantsPerBfs(locations);
  const existing = await readExisting(db);
  const fetchedAt = existing.fetchedAt;

  // Tenants follow the locations on every run, also when nothing is fetched and also for a municipality whose
  // last location is gone (its tenants become []): spec §11. Documents are never deleted.
  let tenantsSynced = 0;
  for (const [bfsNr, list] of tenantsToSync(tenants, existing.tenants)) {
    try {
      await db.collection(EnergyFiguresCollection).doc(String(bfsNr)).set({ tenants: list }, { merge: true });
      tenantsSynced++;
    } catch (error) {
      logger.error(`energyFiguresFetch: could not sync tenants of ${bfsNr}`, error);
    }
  }
  if (locations.length === 0) {
    logger.info(`energyFiguresFetch: no city locations, ${tenantsSynced} tenant lists synced`);
    return;
  }

  const wantedList = bfsNumbersToFetch(locations, fetchedAt, now);
  const wanted = new Set(wantedList);

  // A location whose document is fresh is not fetched, but a stale status of it (the number was corrected)
  // still has to go: a document with `fetchedAt` means Energie Reporter had rows for this number.
  for (const location of locations) {
    const bfsNr = getBfsNr(location);
    if (bfsNr === undefined || wanted.has(bfsNr) || isBlockedByStatus(location) || !fetchedAt.has(bfsNr)) continue;
    await applyStatus(db, location, 'data');
  }

  if (wantedList.length === 0) {
    logger.info(`energyFiguresFetch: ${tenants.size} municipalities, all fresh, ${tenantsSynced} tenant lists synced`);
    return;
  }

  let reporter: { found: Map<number, ReporterRows>; failed: Map<number, Error> } | undefined;
  try {
    reporter = await readEnergyReporter(wanted);
  } catch (error) {
    // The whole source failed (download, ZIP, header, stream): nothing from it is written or marked.
    logger.error('energyFiguresFetch: Energie Reporter failed', error);
  }

  let written = 0;
  let complete = 0;
  let noRow = 0;
  for (const bfsNr of wantedList) {
    const failure = reporter?.failed.get(bfsNr);
    if (failure) logger.error(`energyFiguresFetch: Energie Reporter row of ${bfsNr} is malformed`, failure);
    const rows = reporter?.found.get(bfsNr);

    let tariffs: EnergyTariff[] | undefined;
    try {
      tariffs = await readTariffs(bfsNr);
    } catch (error) {
      logger.error(`energyFiguresFetch: ElCom failed for ${bfsNr}`, error);
    }

    if (rows !== undefined || tariffs !== undefined) {
      try {
        const patch = buildEnergyPatch({ bfsNr, tenants: tenants.get(bfsNr) ?? [], now, reporter: rows, tariffs });
        await db.collection(EnergyFiguresCollection).doc(String(bfsNr)).set(patch, { merge: true });
        written++;
        if ('fetchedAt' in patch) complete++;
      } catch (error) {
        logger.error(`energyFiguresFetch: could not write ${bfsNr}`, error);
      }
    }

    // Step 8: the status follows what Energie Reporter said. A failed source says nothing.
    if (rows) {
      for (const location of locations) {
        if (getBfsNr(location) === bfsNr) await applyStatus(db, location, 'data');
      }
    } else if (reporter && !failure) {
      await markNoRow(db, locations, bfsNr);
      noRow++;
    }
  }

  logger.info(`energyFiguresFetch: ${wantedList.length} wanted, ${written} written, ${complete} complete, ${noRow} without Energie Reporter row, ${tenantsSynced} tenant lists synced`);
}

/** Energie Reporter answered cleanly but has no row for this number: tell the admin through the locations' status. */
async function markNoRow(db: admin.firestore.Firestore, locations: CityDoc[], bfsNr: number): Promise<void> {
  for (const location of locations) {
    if (getBfsNr(location) === bfsNr) await applyStatus(db, location, 'noRow');
  }
}
