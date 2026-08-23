// apps/functions/src/diary/import-diary.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkAdminRole } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr, removeKeyFromOkrModel } from '@okr/shared-util-core';
import { toAliasSlug } from '@okr/system-alias-util';
import {
  DiaryFile,
  normaliseLocationLabel,
  parseDiaryMarkdown,
  toDiaryModel,
  fmNumber,
  fmScalar,
} from '@okr/content-diary-util';
import {
  DiaryCollection,
  DiaryImportCollection,
  DiaryImportModel,
  DiaryModel,
} from '@okr/shared-models';
import type { DiaryWeather } from '@okr/shared-models';

import { getDriveAccessToken } from './drive-client';
import { listArchiveFiles, downloadArchiveFiles } from './read-archive';
import { createDiaryResolver } from './resolver';
import { planWeatherRanges, fetchWeatherRange, mergeWeather } from './weather';

const REGION = 'europe-west6';
// One Cloud Run (2nd gen) invocation may take this long: enough for the ~2'405-file archive to
// be listed, downloaded (concurrency 10) and weather-enriched (~50 Open-Meteo calls) in one pass.
const TIMEOUT_SECONDS = 540;
const WINDOW_SIZE = 200;

const DIARY_DRIVE_CLIENT_ID = defineSecret('DIARY_DRIVE_CLIENT_ID');
const DIARY_DRIVE_CLIENT_SECRET = defineSecret('DIARY_DRIVE_CLIENT_SECRET');
const DIARY_DRIVE_REFRESH_TOKEN = defineSecret('DIARY_DRIVE_REFRESH_TOKEN');

export interface DiaryImportRequest {
  /** Continues an existing run. Omit to start a new one (then `tenantId` is required). */
  runId?: string;
  /** Required only when starting a new run — an existing run already carries its tenant. */
  tenantId?: string;
}

/**
 * The deterministic diary document id: `diaries/<tenant>__<authorKey>__<date>`. Every write is
 * therefore an upsert, and a re-run of the same file can never create a duplicate — see
 * "Deterministische Dokument-IDs" in the design doc.
 */
export function diaryDocId(tenantId: string, authorKey: string, date: string): string {
  return `${tenantId}__${authorKey}__${date}`;
}

/**
 * The next window of (already name-sorted) archive file names strictly after `cursor`. Empty
 * cursor starts at the beginning; a cursor naming a file that no longer exists (deleted between
 * two invocations) still resolves correctly, because this looks for the first name that sorts
 * AFTER the cursor value rather than searching for an exact match — a deleted file simply never
 * matches and is skipped over the same way a matched one would be.
 */
export function nextWindow(names: string[], cursor: string, windowSize: number): string[] {
  const start = names.findIndex((name) => name > cursor);
  if (start < 0) {
    return [];
  }
  return names.slice(start, start + windowSize);
}

/** One successfully parsed and resolved archive file, kept around for the weather merge pass. */
interface ParsedEntry {
  name: string;
  file: DiaryFile;
  model: DiaryModel;
  coords?: { latitude: number; longitude: number };
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * Frontmatter fields the file actually carried, as a `Partial<DiaryWeather>` built straight from
 * the raw frontmatter — NOT from `model.weather`, which `toDiaryModel` already defaults (see
 * diary-model-mapping.ts:110-112). `mergeWeather` needs the absent-vs-genuine-zero distinction
 * that a defaulted object has already destroyed. `fmScalar` returns '' rather than undefined for
 * a missing key, so sunrise/sunset are coerced back to undefined here — '' is never a genuine
 * sunrise/sunset value.
 */
function weatherFromFile(file: DiaryFile): Partial<DiaryWeather> {
  return {
    min: fmNumber(file, 'weather_min'),
    max: fmNumber(file, 'weather_max'),
    precip: fmNumber(file, 'weather_precip'),
    sunrise: fmScalar(file, 'sunrise') || undefined,
    sunset: fmScalar(file, 'sunset') || undefined,
  };
}

/** One compact 'field:file/api' note per field where both sides had a value and disagreed. */
function describeWeatherDeviations(fromFile: Partial<DiaryWeather>, fromApi: Partial<DiaryWeather>): string {
  const fields: Array<keyof DiaryWeather> = ['min', 'max', 'precip', 'sunrise', 'sunset'];
  const parts: string[] = [];
  for (const field of fields) {
    const fileValue = fromFile[field];
    const apiValue = fromApi[field];
    if (fileValue !== undefined && apiValue !== undefined && fileValue !== apiValue) {
      parts.push(`${field}:${fileValue}/${apiValue}`);
    }
  }
  return parts.join(',');
}

function coordKeyOf(coords: { latitude: number; longitude: number }): string {
  return `${coords.latitude},${coords.longitude}`;
}

/**
 * Downloads, parses and resolves the given archive entries, and fills in weather — the
 * "reads, parses, resolves and plans the weather" pass both callables share verbatim, but NOT
 * necessarily over the whole archive: `dryRunDiaryImport` passes every listed entry, while
 * `commitDiaryImport` passes only the current window (see `processRun`), so its downloads,
 * Open-Meteo calls and CPU work shrink with the window instead of redoing the full archive on
 * every invocation. Never writes a diary; that is `processRun`'s job. Mutates `run` with every
 * report-only count as it goes; a per-file failure is recorded in `run.errors`/`run.withoutDate`/
 * `run.dateCollisions` and the loop continues — the import never aborts on a single bad file, it
 * reports.
 *
 * `run.dateCollisions` only catches collisions among the entries actually PASSED IN here. For the
 * dry run (whole archive) that is a real, whole-archive check. For a commit window it can only
 * ever see collisions among that window's ~200 files — two files landing on the same document id
 * from DIFFERENT windows would upsert one after the other without either invocation ever noticing
 * (the second write simply overwrites the first, silently). That gap is acceptable here because
 * `dryRunDiaryImport` is the authoritative full-archive check and is expected to run before any
 * commit; this function does not widen or narrow that guarantee, it just makes explicit that the
 * commit path inherits a strictly weaker version of it.
 */
async function runPipeline(
  db: Firestore,
  tenantId: string,
  authorKey: string,
  token: string,
  run: DiaryImportModel,
  toProcess: Array<{ id: string; name: string; driveFolderId: string }>,
): Promise<ParsedEntry[]> {
  const { files, errors: downloadErrors } = await downloadArchiveFiles(token, toProcess);
  run.errors.push(...downloadErrors);

  const resolver = await createDiaryResolver(db, tenantId);
  const today = getTodayStr(DateFormat.StoreDate);

  const parsedEntries: ParsedEntry[] = [];
  const seenDocIds = new Map<string, string>();
  const weatherEntries: Array<{ date: string; latitude: number; longitude: number }> = [];

  for (const file of files) {
    try {
      const diaryFile = parseDiaryMarkdown(file.text);
      const model = toDiaryModel(diaryFile, tenantId, authorKey, resolver);
      model.driveFolderId = file.driveFolderId;
      run.parsed++;

      for (const slug of model.customPeopleLabels) {
        bump(run.unresolvedPeople, toAliasSlug(slug));
      }
      if (!model.location && model.customLocationLabel !== '') {
        bump(run.unresolvedLocations, normaliseLocationLabel(model.customLocationLabel));
      }

      if (model.date === '') {
        run.withoutDate.push(file.name);
      } else {
        const docId = diaryDocId(tenantId, authorKey, model.date);
        if (seenDocIds.has(docId)) {
          run.dateCollisions.push(file.name);
        } else {
          seenDocIds.set(docId, file.name);
        }
      }

      const locationLabel = fmScalar(diaryFile, 'location');
      const coords = locationLabel === '' ? undefined : resolver.resolveLocationCoords(locationLabel);
      if (coords && model.date !== '') {
        weatherEntries.push({ date: model.date, latitude: coords.latitude, longitude: coords.longitude });
      }

      parsedEntries.push({ name: file.name, file: diaryFile, model, coords });
    } catch (err) {
      // The other kind of per-file failure: an unparsable file is an errors[] entry, never an
      // abort. Only the file NAME is recorded, never its content.
      run.errors.push({ name: file.name, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const ranges = planWeatherRanges(weatherEntries, today);
  const weatherByCoord = new Map<string, Map<string, Partial<DiaryWeather>>>();
  await Promise.all(
    ranges.map(async (range) => {
      const daily = await fetchWeatherRange(range);
      const key = `${range.latitude},${range.longitude}`;
      const coordMap = weatherByCoord.get(key) ?? new Map<string, Partial<DiaryWeather>>();
      for (const [date, w] of daily) {
        coordMap.set(date, w);
      }
      weatherByCoord.set(key, coordMap);
    }),
  );

  for (const entry of parsedEntries) {
    const fromFile = weatherFromFile(entry.file);
    const fromApi = entry.coords
      ? (weatherByCoord.get(coordKeyOf(entry.coords))?.get(entry.model.date) ?? {})
      : {};
    entry.model.weather = mergeWeather(fromFile, fromApi);

    const deviations = describeWeatherDeviations(fromFile, fromApi);
    if (deviations !== '') {
      run.weatherDeviations[entry.name] = deviations;
    }
  }

  return parsedEntries;
}

/**
 * Lists the whole archive (cheap: ~3 Drive calls) and returns it sorted by name. Failing to list
 * at all is one of only two conditions that abort the whole run rather than being reported per
 * file: the archive could not be listed (missing/invalid Drive token, or Drive itself
 * unreachable) — a configuration error, not a data error.
 */
async function listSortedArchive(token: string): Promise<Array<{ id: string; name: string; driveFolderId: string }>> {
  try {
    const listed = await listArchiveFiles(token);
    return [...listed].sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    throw new HttpsError(
      'failed-precondition',
      `diary import: drive list failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Runs the shared pipeline, then either writes only the report (dry run) or upserts the next
 * window of up to `WINDOW_SIZE` diaries and advances the cursor (commit). The window is chosen
 * from the listing BEFORE anything is downloaded: `dryRunDiaryImport` needs to see the whole
 * archive (its output — totals, unresolved-slug frequencies, collision detection — is only
 * meaningful across everything), but `commitDiaryImport` downloads, parses, resolves and
 * weather-enriches ONLY the entries in the current window. That is what makes the cursor actually
 * survive a timeout, network error or quota brake at one window's cost rather than the whole
 * run's: an invocation that only ever touches ~200 files cannot get slower as the run progresses,
 * unlike a design that rescans the full archive every time and merely limits the WRITE to a
 * window. `startedAt`, `lastName`, `processed` and `written` are the only fields carried forward
 * from an existing run; every other report field reflects this call's fresh scan (of the whole
 * archive for a dry run, of the window only for a commit — see the collision-detection caveat on
 * `runPipeline`).
 */
async function processRun(
  request: CallableRequest<DiaryImportRequest>,
  db: Firestore,
  token: string,
  isDryRun: boolean,
): Promise<DiaryImportModel> {
  // `authorKey` is the caller's own uid, never a parameter. The `diaries` rule is
  // `authorKey == request.auth.uid`, and the privacy row resolves the subject the same way — a
  // parameter would let an admin write entries under someone else's name and make both false.
  // This also covers the second abort condition ("an authorKey with no user"): checkAdminRole
  // above already requires a users/{uid} document with roles.admin for this same uid to exist.
  const authorKey = request.auth?.uid as string;

  const payload = request.data ?? {};
  let runId = payload.runId;
  let tenantId = payload.tenantId;
  let startedAt = getTodayStr(DateFormat.StoreDateTime);
  let cursor = '';
  let processed = 0;
  let written = 0;

  if (runId) {
    const snap = await db.collection(DiaryImportCollection).doc(runId).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', `diaryImports/${runId} does not exist.`);
    }
    const existing = snap.data() as DiaryImportModel;
    tenantId = existing.tenants[0];
    startedAt = existing.startedAt || startedAt;
    cursor = existing.lastName;
    processed = existing.processed;
    written = existing.written;
  } else {
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'tenantId is required to start a new import run.');
    }
    runId = db.collection(DiaryImportCollection).doc().id;
  }

  const run = new DiaryImportModel(tenantId);
  run.authorKey = authorKey;
  run.startedAt = startedAt;
  run.isDryRun = isDryRun;
  run.processed = processed;
  run.written = written;
  run.lastName = cursor;
  run.phase = 'reading';

  // `run.total` is always the SIZE OF THE WHOLE ARCHIVE, not of whatever this call processes —
  // it is the denominator the caller uses to know when to stop, so it must not shrink to the
  // window's size on a commit call.
  const listed = await listSortedArchive(token);
  const sortedNames = listed.map((e) => e.name);
  run.total = listed.length;

  const window = isDryRun ? [] : nextWindow(sortedNames, cursor, WINDOW_SIZE);
  const toProcess = isDryRun
    ? listed
    : listed.filter((e) => window.includes(e.name));

  run.phase = 'reading';
  const entries = await runPipeline(db, tenantId, authorKey, token, run, toProcess);
  run.phase = 'weather';

  if (isDryRun) {
    run.phase = 'done';
  } else if (window.length === 0) {
    run.phase = 'done';
  } else {
    const byName = new Map(entries.map((e) => [e.name, e] as const));
    const batch = db.batch();
    let writtenThisWindow = 0;
    for (const name of window) {
      const entry = byName.get(name);
      if (!entry || entry.model.date === '') {
        // A download/parse failure or a missing date — already recorded in run.errors /
        // run.withoutDate. The cursor still advances past it so the run cannot get stuck.
        continue;
      }
      const docId = diaryDocId(tenantId, authorKey, entry.model.date);
      // JSON round-trip: strips 'okey' (via removeKeyFromOkrModel) and, crucially, drops any
      // key `toDiaryModel` set to an explicit `undefined` (e.g. an unresolved `location`) —
      // Firestore's admin SDK rejects undefined field values outright.
      const doc = JSON.parse(JSON.stringify(removeKeyFromOkrModel(entry.model)));
      batch.set(db.collection(DiaryCollection).doc(docId), doc);
      writtenThisWindow++;
    }
    await batch.commit();

    run.processed = processed + window.length;
    run.written = written + writtenThisWindow;
    run.lastName = window[window.length - 1];
    run.phase = run.lastName === sortedNames[sortedNames.length - 1] ? 'done' : 'importing';
  }

  await db.collection(DiaryImportCollection).doc(runId).set(removeKeyFromOkrModel(run));

  logger.info(`${isDryRun ? 'dryRunDiaryImport' : 'commitDiaryImport'}: ok`, {
    runId,
    phase: run.phase,
    total: run.total,
    parsed: run.parsed,
    processed: run.processed,
    written: run.written,
    errorCount: run.errors.length,
  });

  run.okey = runId;
  return run;
}

async function driveToken(): Promise<string> {
  try {
    return await getDriveAccessToken(
      DIARY_DRIVE_REFRESH_TOKEN.value(),
      DIARY_DRIVE_CLIENT_ID.value(),
      DIARY_DRIVE_CLIENT_SECRET.value(),
    );
  } catch (err) {
    throw new HttpsError(
      'failed-precondition',
      `diary import: drive token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Reads the whole archive, parses and resolves every file, plans and fetches weather, and writes
 * the run report — but writes NO diary. Safe to call repeatedly to preview the alias-maintenance
 * backlog (`unresolvedPeople`/`unresolvedLocations`) before ever touching `diaries`.
 */
export const dryRunDiaryImport = onCall<DiaryImportRequest, Promise<DiaryImportModel>>(
  {
    region: REGION,
    enforceAppCheck: true,
    timeoutSeconds: TIMEOUT_SECONDS,
    secrets: [DIARY_DRIVE_CLIENT_ID, DIARY_DRIVE_CLIENT_SECRET, DIARY_DRIVE_REFRESH_TOKEN],
  },
  async (request) => {
    checkAppCheckToken(request, 'dryRunDiaryImport');
    checkAuthentication(request, 'dryRunDiaryImport');
    await checkAdminRole(request, 'dryRunDiaryImport');
    const token = await driveToken();
    return processRun(request, getFirestore(), token, true);
  },
);

/**
 * Does the same read/parse/resolve/weather pass as `dryRunDiaryImport`, then upserts one window
 * of up to 200 diaries and advances the cursor. The caller re-invokes with the returned `okey` as
 * `runId` until `phase === 'done'` — a timeout or transient failure costs one window, not the run.
 */
export const commitDiaryImport = onCall<DiaryImportRequest, Promise<DiaryImportModel>>(
  {
    region: REGION,
    enforceAppCheck: true,
    timeoutSeconds: TIMEOUT_SECONDS,
    secrets: [DIARY_DRIVE_CLIENT_ID, DIARY_DRIVE_CLIENT_SECRET, DIARY_DRIVE_REFRESH_TOKEN],
  },
  async (request) => {
    checkAppCheckToken(request, 'commitDiaryImport');
    checkAuthentication(request, 'commitDiaryImport');
    await checkAdminRole(request, 'commitDiaryImport');
    const token = await driveToken();
    return processRun(request, getFirestore(), token, false);
  },
);
