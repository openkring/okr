import { describe, expect, it } from 'vitest';
import { JOURNAL_SCHEMA, needsJournalReset } from './journal-schema.util';

describe('needsJournalReset', () => {
  it('resets a store that has no schema version (never reset)', () => {
    expect(needsJournalReset(undefined)).toBe(true);
  });

  it('resets a store below the current version', () => {
    expect(needsJournalReset('1')).toBe(true);
  });

  it('resets a version that cannot be read', () => {
    expect(needsJournalReset('')).toBe(true);
    expect(needsJournalReset('abc')).toBe(true);
  });

  it('leaves a store at the current or a later version alone', () => {
    expect(needsJournalReset(String(JOURNAL_SCHEMA))).toBe(false);
    expect(needsJournalReset(String(JOURNAL_SCHEMA + 1))).toBe(false);
  });
});
