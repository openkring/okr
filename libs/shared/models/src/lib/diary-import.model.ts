import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

/** Which stage of one import run is currently in progress. */
export type DiaryImportPhase = 'reading' | 'importing' | 'weather' | 'done';

/**
 * One import run. It is the CURSOR and the REPORT in one document: the commit callable processes
 * a window of files per invocation and writes its progress here, so a timeout costs a window
 * rather than the run. It survives the invocation, renders in the app, and a second run can be
 * diffed against the first — which a log line cannot do.
 *
 * NOT personal data, and it must stay that way: counts, file names and unresolved SLUGS only.
 * Never a person's name, never a diary title. It is classified on that basis in
 * `apps/functions/src/privacy/subject-data-map.ts`.
 */
export class DiaryImportModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

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
