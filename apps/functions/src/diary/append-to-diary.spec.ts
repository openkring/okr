import { describe, expect, it } from 'vitest';

import { decideDiaryLine } from './append-to-diary';
import { rejectsForOldClient, validateDiaryLineRequest } from './record-diary-line';

describe('decideDiaryLine', () => {
  it('creates a missing entry on add', () => expect(decideDiaryLine(undefined, 'add')).toBe('create'));
  it('skips a missing entry on remove', () => expect(decideDiaryLine(undefined, 'remove')).toBe('skipped-missing'));
  it('updates a draft', () => expect(decideDiaryLine({ status: 'draft' }, 'add')).toBe('update'));
  it('updates an entry without status', () => expect(decideDiaryLine({}, 'remove')).toBe('update'));
  it('never touches a final entry', () => {
    expect(decideDiaryLine({ status: 'final' }, 'add')).toBe('skipped-final');
    expect(decideDiaryLine({ status: 'final' }, 'remove')).toBe('skipped-final');
  });
});

describe('validateDiaryLineRequest', () => {
  const ok = { tenantId: 'scs', date: '20260930', line: '  Jass Schieber  ' };
  it('returns the trimmed line', () => expect(validateDiaryLineRequest(ok).line).toBe('Jass Schieber'));
  it('defaults a missing source to jasstafel (old clients)', () =>
    expect(validateDiaryLineRequest(ok).source).toBe('jasstafel'));
  it('accepts a known source', () =>
    expect(validateDiaryLineRequest({ ...ok, source: 'taskDone' }).source).toBe('taskDone'));
  it('rejects an unknown source', () =>
    expect(() => validateDiaryLineRequest({ ...ok, source: 'nope' as never })).toThrow());
  it('needs a tenant', () => expect(() => validateDiaryLineRequest({ ...ok, tenantId: '' })).toThrow());
  it('rejects an aggregate date', () => expect(() => validateDiaryLineRequest({ ...ok, date: '20260900' })).toThrow());
  it('rejects an empty line', () => expect(() => validateDiaryLineRequest({ ...ok, line: '   ' })).toThrow());
  it('rejects an overlong line', () => expect(() => validateDiaryLineRequest({ ...ok, line: 'x'.repeat(501) })).toThrow());
  it('rejects a missing body', () => expect(() => validateDiaryLineRequest(undefined)).toThrow());
});

describe('rejectsForOldClient', () => {
  it('rejects no source + no target', () => expect(rejectsForOldClient(false, 'skipped-no-target')).toBe(true));
  it('keeps no-target for a client with source', () => expect(rejectsForOldClient(true, 'skipped-no-target')).toBe(false));
  it('does not reject a write for an old client', () => expect(rejectsForOldClient(false, 'written')).toBe(false));
});
