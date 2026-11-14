/**
 * The version of what the iPad's local store holds (spec 1.154 §11). Version 2 writes sections, not blocks: a store
 * below it holds test data of the block format, which is reset, not converted. The `meta` key it is kept under.
 */
export const JOURNAL_SCHEMA_META = 'journalSchema';
export const JOURNAL_SCHEMA = 2;
/** Meta keys that belong to the cleared records: the download cursor of each journal (`cursor:<jk>`). */
export const JOURNAL_RESET_META_PREFIX = 'cursor:';

/** True when the stored schema version is missing, unreadable or below the current one. */
export function needsJournalReset(stored: string | undefined): boolean {
  const version = Number(stored);
  return !Number.isInteger(version) || version < JOURNAL_SCHEMA;
}
