// apps/functions/src/diary/read-archive.ts
import { DIARY_FILE_NAME } from '@okr/content-diary-util';
import { driveFetch } from './drive-client';

/** One page of `files.list`, restricted to the fields this module reads. */
interface DriveListFile {
  id: string;
  name: string;
  parents?: string[];
}

interface DriveListResponse {
  files?: DriveListFile[];
  nextPageToken?: string;
}

/** One diary file, downloaded and ready for parsing. Text content only lives in memory here. */
export interface ArchiveFile {
  name: string;
  driveFolderId: string;
  text: string;
}

const LIST_PAGE_SIZE = '1000';
const DOWNLOAD_CONCURRENCY = 10;
const DOWNLOAD_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Drive can express `name contains 'diary'`, but not `^\d{8}diary.*\.md$` — so the query is a
 * prefilter and DIARY_FILE_NAME is the criterion. Same constant the corpus round-trip uses, so
 * the import and the round-trip can never disagree about what a diary file is.
 */
export function keepDiaryFiles<T extends { name: string }>(entries: T[]): T[] {
  return entries.filter((e) => DIARY_FILE_NAME.test(e.name));
}

/**
 * Lists every diary file in the archive with a single, name-scoped query — never by walking the
 * `archive/202x/{jahr}/{monat}/{tag}/` tree. The file name carries the date (see DIARY_FILE_NAME),
 * so this one paginated `files.list` returns everything in about three calls (2405 files at
 * pageSize 1000), and each result's `parents[0]` already IS the `driveFolderId` the diary model
 * wants. Walking the tree instead would cost ~2'780 extra listing calls (one per year/month/day
 * folder) purely to re-derive information this single query's response already contains.
 */
export async function listArchiveFiles(
  token: string,
): Promise<Array<{ id: string; name: string; driveFolderId: string }>> {
  const found: DriveListFile[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      q: "name contains 'diary' and trashed = false",
      fields: 'nextPageToken,files(id,name,parents)',
      pageSize: LIST_PAGE_SIZE,
    };
    if (pageToken) {
      params.pageToken = pageToken;
    }
    const response = await driveFetch(token, '/files', params);
    if (!response.ok) {
      throw new Error(`drive list failed: ${response.status}`);
    }
    const json = (await response.json()) as DriveListResponse;
    found.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  const entries = found.map((f) => ({ id: f.id, name: f.name, driveFolderId: f.parents?.[0] ?? '' }));
  return keepDiaryFiles(entries);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Downloads one file's content, retrying transient failures with backoff. Never logs the text. */
async function downloadOne(
  token: string,
  entry: { id: string; name: string; driveFolderId: string },
): Promise<ArchiveFile> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    try {
      const response = await driveFetch(token, `/files/${entry.id}`, { alt: 'media' });
      if (!response.ok) {
        throw new Error(`drive download failed: ${response.status}`);
      }
      const text = await response.text();
      return { name: entry.name, driveFolderId: entry.driveFolderId, text };
    } catch (err) {
      lastError = err;
      if (attempt < DOWNLOAD_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Downloads the given entries' content, `DOWNLOAD_CONCURRENCY` at a time. The import never
 * aborts on a bad file: a download that still fails after three retries becomes an `errors[]`
 * entry, and the batch continues. File content is returned to the caller but never logged here —
 * the archive is a private diary.
 */
export async function downloadArchiveFiles(
  token: string,
  entries: Array<{ id: string; name: string; driveFolderId: string }>,
  concurrency = DOWNLOAD_CONCURRENCY,
): Promise<{ files: ArchiveFile[]; errors: Array<{ name: string; reason: string }> }> {
  const files: ArchiveFile[] = [];
  const errors: Array<{ name: string; reason: string }> = [];

  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= entries.length) {
        return;
      }
      const entry = entries[i];
      try {
        files.push(await downloadOne(token, entry));
      } catch (err) {
        errors.push({ name: entry.name, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, () => worker());
  await Promise.all(workers);

  return { files, errors };
}
