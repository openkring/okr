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
  diaryKey,
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
// The dry run gets the 2nd-gen maximum instead. It cannot be windowed the way the commit run is:
// its whole point is the WHOLE-archive duplicate check, and `seenDocIds` in `runPipeline` lives
// for one invocation (see the caveat on `runPipeline`). So it reads every file in one pass, and
// that pass has outgrown 540s — 430s on 2026-08-30 at ~7'400 files, i.e. 20% headroom, which the
// next batch of filled-in entries consumed. 3600s is the ceiling, not a comfortable margin: if
// this run ever nears it, the fix is to carry the seen dates ACROSS windows in the run document
// and window the dry run too, not another raise.
const DRY_RUN_TIMEOUT_SECONDS = 3600;
// The default 256 MiB is not enough. Both callables hold the WHOLE archive in memory for one
// pass — the file list, every downloaded markdown body, and the accumulating run report — and the
// archive has since grown from the ~2'405 files this was sized for to >7'400. At 256 MiB the
// container was killed mid-run and the client saw a bare 500 with no HttpsError to explain it.
// This scales with the archive, so it is a ceiling to revisit, not a solved problem: if the
// archive doubles again, raise it or make the dry run windowed the way the commit run already is.
const MEMORY = '1GiB' as const;
// Must stay comfortably under Firestore's 500-writes-per-batch limit: `processRun` puts one
// `batch.set` per window entry into a single `batch.commit()` (see below) — raise this only
// together with switching to multiple batches.
const WINDOW_SIZE = 200;
// A generous ceiling for report fields that accumulate across a commit run's many windows (see
// "Report merging" on `processRun`), well above the ~2'405-file archive this was built for. Not a
// tuning knob — it exists so a Firestore document cannot grow without bound if the archive is
// ever far larger than expected.
const MAX_REPORT_ENTRIES = 5000;

const DIARY_DRIVE_CLIENT_ID = defineSecret('DIARY_DRIVE_CLIENT_ID');
const DIARY_DRIVE_CLIENT_SECRET = defineSecret('DIARY_DRIVE_CLIENT_SECRET');
const DIARY_DRIVE_REFRESH_TOKEN = defineSecret('DIARY_DRIVE_REFRESH_TOKEN');
/**
 * The Firebase Auth uid of the ONE person whose Drive refresh token this function holds. Both
 * callables below may only ever import that one person's own archive — see `assertArchiveOwner`.
 *
 * Declared as a secret for DELIVERY, not because a uid is sensitive. It is not: knowing it does
 * not let anyone authenticate as that user, and it already appears in every `users/{uid}` document
 * id, in every diary's `authorKey`, and in the rules as `request.auth.uid`. But Secret Manager is
 * the only wired-up config channel here — every .env file is git-ignored and `dist/apps/functions` is
 * rebuilt on every deploy, so a `defineString` param would have nowhere to persist and the CLI
 * would prompt for it on every functions deploy, including deploys that have nothing to do with
 * the diary. If per-tenant config ever moves into `app-config/<tenantId>`, this belongs there.
 *
 * Unset it resolves to '', which `isArchiveOwner` rejects — a misconfigured deploy denies
 * everyone rather than letting everyone through.
 */
const DIARY_OWNER_UID = defineSecret('DIARY_OWNER_UID');

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
  return diaryKey(tenantId, authorKey, date);
}

/**
 * Plain UTF-16 code-unit order — the ONE comparator both `listSortedArchive`'s sort and
 * `nextWindow`'s cursor advance must use. `String.prototype.localeCompare` disagrees with it on
 * mixed-case names (locale order puts 'a' before 'Z'; code-unit order puts 'Z' before 'a', since
 * U+005A < U+0061). `nextWindow` walks a sorted array crossing a cursor with this same ordering,
 * so the array MUST already be sorted with it too, or a file's true successor can land on the
 * wrong side of the cursor and be silently skipped forever. Do not swap this for `localeCompare`
 * in one place without the other.
 */
export function compareFileName(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/**
 * True when `callerUid` is the ONE person this deployment's Drive secrets belong to.
 *
 * This is the primary guard against cross-tenant exfiltration. `checkAdminRole`
 * (`@okr/shared-util-functions`) resolves `users/{uid}.roles.admin` GLOBALLY — with no tenant
 * scoping — so on its own it authorizes ANY tenant's admin, not just this archive's owner. Both
 * callables below read the archive with OUR OWN Drive credentials (not the caller's) and write
 * under `authorKey = request.auth.uid`, i.e. the CALLER's uid. Without this extra check, an
 * admin of `scs`/`kring`/`p13`/`elab`/`bkg` could call `commitDiaryImport({ tenantId: '<their
 * own tenant>' })`, have ~2405 private diary entries written under their own uid, and then read
 * them back in full via `exportMyData` (`subject-data-map.ts`'s `diaries` row: `onExport:
 * 'full'`). The project already made exactly this argument against itself when it rejected a
 * callable for the (much less sensitive) tenant-migration script — see
 * `planning/specs/2026-08-22-diary-import-design.md`, "V1 — `bka` auf alle Personen und
 * Adressen": "Eine Callable hätte `checkAdminRole` gebraucht, und das prüft `roles.admin`
 * **global** — jeder Admin irgendeines Tenants hätte sie auf seinen eigenen Tenant richten und
 * das gesamte Verzeichnis ... übernehmen können." Do not widen this to "any admin" again without
 * re-reading that rejection.
 */
export function isArchiveOwner(callerUid: string | undefined, ownerUid: string): boolean {
  return callerUid !== undefined && callerUid !== '' && callerUid === ownerUid;
}

/**
 * True when `tenantId` is one of the tenants the caller's own `users/{uid}` document lists. A
 * caller-supplied `tenantId` payload field must never be trusted on its own — see
 * `isArchiveOwner` above for why — this is the second half of the defence: even the archive
 * owner may only start a run for a tenant they actually belong to.
 */
export function isCallerTenant(callerTenants: string[], tenantId: string): boolean {
  return callerTenants.includes(tenantId);
}

/**
 * Throws unless `callerUid` is the archive owner. The thrown message deliberately does not name
 * the expected uid — it must not leak who the owner is to a caller that fails this check.
 */
function assertArchiveOwner(callerUid: string | undefined, ownerUid: string, nameOfCallingFunction: string): void {
  if (!isArchiveOwner(callerUid, ownerUid)) {
    logger.error(`${nameOfCallingFunction}: caller ${callerUid ?? '(unauthenticated)'} is not the diary archive owner`);
    throw new HttpsError('permission-denied', 'This operation is not available to this account.');
  }
}

/**
 * The next window of (already name-sorted, `compareFileName` order — see above) archive file
 * names strictly after `cursor`. Empty cursor starts at the beginning; a cursor naming a file
 * that no longer exists (deleted between two invocations) still resolves correctly, because this
 * looks for the first name that sorts AFTER the cursor value rather than searching for an exact
 * match — a deleted file simply never matches and is skipped over the same way a matched one
 * would be.
 */
export function nextWindow(names: string[], cursor: string, windowSize: number): string[] {
  const start = names.findIndex((name) => compareFileName(name, cursor) > 0);
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
 * Report-merging helpers for a continued commit run (see "Report merging" on `processRun`).
 * `processRun` builds a fresh `DiaryImportModel` per invocation, computes THIS WINDOW's report
 * fields into it via `runPipeline`, then merges the PREVIOUS windows' fields (loaded from the
 * existing run document) on top before writing — otherwise `.set()` would silently discard
 * windows 1..N-1's errors/collisions/etc. and only the last window's report would survive.
 * `unresolvedPeople`/`unresolvedLocations` are summed, not capped: they are keyed by the
 * archive's distinct person/location slug vocabulary (measured at ~600), which cannot grow with
 * the number of windows. The others accumulate one entry per file, so they ARE capped at
 * `MAX_REPORT_ENTRIES` — comfortably above the archive size, but not unbounded — with a synthetic
 * final entry recording how many were dropped, so a truncation is visible rather than silent.
 */
function mergeCappedStrings(previous: string[], next: string[]): string[] {
  const merged = [...previous, ...next];
  if (merged.length <= MAX_REPORT_ENTRIES) {
    return merged;
  }
  const dropped = merged.length - (MAX_REPORT_ENTRIES - 1);
  return [...merged.slice(0, MAX_REPORT_ENTRIES - 1), `…and ${dropped} more entries dropped (report cap ${MAX_REPORT_ENTRIES})`];
}

function mergeCappedErrors(
  previous: Array<{ name: string; reason: string }>,
  next: Array<{ name: string; reason: string }>,
): Array<{ name: string; reason: string }> {
  const merged = [...previous, ...next];
  if (merged.length <= MAX_REPORT_ENTRIES) {
    return merged;
  }
  const dropped = merged.length - (MAX_REPORT_ENTRIES - 1);
  return [
    ...merged.slice(0, MAX_REPORT_ENTRIES - 1),
    { name: '', reason: `…and ${dropped} more errors dropped (report cap ${MAX_REPORT_ENTRIES})` },
  ];
}

function mergeCounts(previous: Record<string, number>, next: Record<string, number>): Record<string, number> {
  const merged: Record<string, number> = { ...previous };
  for (const [key, count] of Object.entries(next)) {
    merged[key] = (merged[key] ?? 0) + count;
  }
  return merged;
}

function mergeCappedDeviations(previous: Record<string, string>, next: Record<string, string>): Record<string, string> {
  const merged = { ...previous, ...next };
  const keys = Object.keys(merged);
  if (keys.length <= MAX_REPORT_ENTRIES) {
    return merged;
  }
  const dropped = keys.length - (MAX_REPORT_ENTRIES - 1);
  const capped: Record<string, string> = {};
  for (const key of keys.slice(0, MAX_REPORT_ENTRIES - 1)) {
    capped[key] = merged[key];
  }
  capped['(truncated)'] = `…and ${dropped} more entries dropped (report cap ${MAX_REPORT_ENTRIES})`;
  return capped;
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

/**
 * One compact 'field:file/api' note per field where both sides had a value and disagreed.
 * `fetchWeatherRange` (weather.ts `toLocalTime`) returns `''` for sunrise/sunset when Open-Meteo
 * did not supply one, not `undefined` — treated here as "the API had no value", the same as
 * `undefined`, so a file-only sunrise/sunset never gets reported as a spurious 'x/' deviation.
 */
function describeWeatherDeviations(fromFile: Partial<DiaryWeather>, fromApi: Partial<DiaryWeather>): string {
  const fields: Array<keyof DiaryWeather> = ['min', 'max', 'precip', 'sunrise', 'sunset'];
  const parts: string[] = [];
  for (const field of fields) {
    const fileValue = fromFile[field];
    const apiValue = fromApi[field] === '' ? undefined : fromApi[field];
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
      // Only a DAY has weather. A month or year aggregate carries a zeroed date ('19900000') that
      // is not a calendar date, and `planWeatherRanges` takes the min/max over a whole coordinate
      // group — so one aggregate would push that group's range start to '1990-00-00', Open-Meteo
      // would reject the call, and EVERY day sharing those coordinates would silently lose its
      // measured weather. Two aggregates with a location were enough to cost ~170 days theirs.
      if (coords && model.date !== '' && model.scope === 'day') {
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
    // A month or year aggregate has no weather at all — not a measured one, and not one copied
    // out of its frontmatter. "The weather in 1990" is not a fact, so the entry keeps
    // DEFAULT_DIARY_WEATHER and is never reported as deviating.
    if (entry.model.scope !== 'day') {
      continue;
    }
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
    // compareFileName, not localeCompare — must match nextWindow's ordering exactly (see there).
    return [...listed].sort((a, b) => compareFileName(a.name, b.name));
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
 * window.
 *
 * **Report merging.** `startedAt`, `lastName`, `processed` and `written` are carried forward from
 * an existing run as before, but so now is every OTHER report field on a commit continuation:
 * `runPipeline` computes fresh counts for THIS window only, and those are merged on top of the
 * previous windows' counts (loaded from the existing run doc) before the merged result is
 * written — see the `mergeCapped*`/`mergeCounts` helpers above. Earlier this callable simply
 * overwrote the whole document every call, which meant only the LAST window's errors, unresolved
 * slugs, date collisions etc. ever survived — a file that failed to download in window 3 of 13
 * became invisible the moment window 4 was written. That directly contradicted "the import never
 * aborts, it reports" for the one path (commit) where the report is the only way a failure ever
 * surfaces. A dry run has no such merge to do: it is always a single, full-archive pass, so its
 * fresh scan already IS the whole report.
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
  let existing: DiaryImportModel | undefined;

  if (runId) {
    const snap = await db.collection(DiaryImportCollection).doc(runId).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', `diaryImports/${runId} does not exist.`);
    }
    existing = snap.data() as DiaryImportModel;
    tenantId = existing.tenants[0];
    startedAt = existing.startedAt || startedAt;
    cursor = existing.lastName;
    processed = existing.processed;
    written = existing.written;
  } else {
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'tenantId is required to start a new import run.');
    }
    // Never trust the payload's `tenantId` on its own — see `isCallerTenant` above. A run may
    // only be started for a tenant the caller's own `users/{uid}` document actually lists, even
    // though `assertArchiveOwner` (called before `processRun`) already narrows the caller down
    // to one specific person: defence in depth, not redundancy — a future change to the owner
    // check must not silently reopen the tenant-spoofing path this closes.
    const callerSnap = await db.collection('users').doc(authorKey).get();
    const callerTenants = (callerSnap.data()?.['tenants'] as string[] | undefined) ?? [];
    if (!isCallerTenant(callerTenants, tenantId)) {
      throw new HttpsError('permission-denied', 'tenantId does not belong to the caller.');
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

  // `run.total` is always the SIZE OF THE WHOLE ARCHIVE, not of whatever this call processes —
  // it is the denominator the caller uses to know when to stop, so it must not shrink to the
  // window's size on a commit call.
  const listed = await listSortedArchive(token);
  const sortedNames = listed.map((e) => e.name);
  run.total = listed.length;

  const window = isDryRun ? [] : nextWindow(sortedNames, cursor, WINDOW_SIZE);
  const windowNames = new Set(window);
  const toProcess = isDryRun ? listed : listed.filter((e) => windowNames.has(e.name));

  const entries = await runPipeline(db, tenantId, authorKey, token, run, toProcess);

  if (!isDryRun && existing) {
    run.parsed += existing.parsed;
    run.errors = mergeCappedErrors(existing.errors, run.errors);
    run.withoutDate = mergeCappedStrings(existing.withoutDate, run.withoutDate);
    run.dateCollisions = mergeCappedStrings(existing.dateCollisions, run.dateCollisions);
    run.unresolvedPeople = mergeCounts(existing.unresolvedPeople, run.unresolvedPeople);
    run.unresolvedLocations = mergeCounts(existing.unresolvedLocations, run.unresolvedLocations);
    run.weatherDeviations = mergeCappedDeviations(existing.weatherDeviations, run.weatherDeviations);
  }

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
        // run.withoutDate. Note this is NOT how month/year aggregates are handled: they carry a
        // zero-padded date ('20041000', '19900000') from their `scope`, so they pass here and are
        // written like any other entry. An empty date now means the date is really absent or
        // contradicts its own scope. The cursor still advances past it so the run cannot get stuck.
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
    timeoutSeconds: DRY_RUN_TIMEOUT_SECONDS,
    memory: MEMORY,
    secrets: [DIARY_DRIVE_CLIENT_ID, DIARY_DRIVE_CLIENT_SECRET, DIARY_DRIVE_REFRESH_TOKEN, DIARY_OWNER_UID],
  },
  async (request) => {
    checkAppCheckToken(request, 'dryRunDiaryImport');
    checkAuthentication(request, 'dryRunDiaryImport');
    await checkAdminRole(request, 'dryRunDiaryImport');
    assertArchiveOwner(request.auth?.uid, DIARY_OWNER_UID.value(), 'dryRunDiaryImport');
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
    memory: MEMORY,
    secrets: [DIARY_DRIVE_CLIENT_ID, DIARY_DRIVE_CLIENT_SECRET, DIARY_DRIVE_REFRESH_TOKEN, DIARY_OWNER_UID],
  },
  async (request) => {
    checkAppCheckToken(request, 'commitDiaryImport');
    checkAuthentication(request, 'commitDiaryImport');
    await checkAdminRole(request, 'commitDiaryImport');
    assertArchiveOwner(request.auth?.uid, DIARY_OWNER_UID.value(), 'commitDiaryImport');
    const token = await driveToken();
    return processRun(request, getFirestore(), token, false);
  },
);
