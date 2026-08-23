import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** Which stage of one import run is currently in progress. */
export type DiaryImportPhase = 'reading' | 'importing' | 'weather' | 'done';

/**
 * One import run. It is the CURSOR and the REPORT in one document: the commit callable processes
 * a window of files per invocation and writes its progress here, so a timeout costs a window
 * rather than the run. It survives the invocation, renders in the app, and a second run can be
 * diffed against the first — which a log line cannot do.
 *
 * IS personal data of the run's AUTHOR — `authorKey` is the subject link, and it is classified
 * as the author's own T2 row (voluntary, like `diaries`) in
 * `apps/functions/src/privacy/subject-data-map.ts`. `unresolvedPeople`/`unresolvedLocations` are
 * keyed by name-derived SLUGS, not anonymous counters — a slug is trivially reversible, which is
 * exactly why it is not exported to or matched against anyone but the run's own author. The field
 * still must never carry a person's FULL name or a diary TITLE: only the normalised slug.
 */
export class DiaryImportModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  /** Firebase uid of whoever started the run — the subject link for the privacy map. */
  public authorKey = DEFAULT_KEY;

  public startedAt = '';
  public phase: DiaryImportPhase = 'reading';
  public isDryRun = true;
  public total = 0;
  public processed = 0;
  /** file name the last window stopped after — where the next invocation resumes */
  public lastName = '';

  public parsed = 0;
  public written = 0;
  /** normalised slug → number of entries that could not resolve it */
  public unresolvedPeople: Record<string, number> = {};
  public unresolvedLocations: Record<string, number> = {};
  /** file names that mapped onto an id another file already claimed — expected to be zero */
  public dateCollisions: string[] = [];
  public withoutDate: string[] = [];
  /** file name → what the file said vs what the api said, for the report only */
  public weatherDeviations: Record<string, string> = {};
  public errors: Array<{ name: string; reason: string }> = [];

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const DiaryImportCollection = 'diaryImports';
export const DiaryImportModelName = 'diaryImport';
