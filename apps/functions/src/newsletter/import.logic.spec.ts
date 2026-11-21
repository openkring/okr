import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { countResult, emptySummary, entryDate, validateImportRow } from './import.logic';
import { runImport } from './import';
import type { SubscribeInput, SubscribeResult } from './subscriber';

describe('validateImportRow', () => {
  it('normalises the address and trims names', () => {
    expect(validateImportRow({ email: ' Ann@Example.CH ', firstName: ' Ann ', lastName: 'B', optinAt: '', confirmAt: '' }))
      .toEqual({ email: 'ann@example.ch', firstName: 'Ann', lastName: 'B', optinAt: '', confirmAt: '' });
  });
  it('rejects a malformed or missing email and non-objects', () => {
    expect(validateImportRow({ email: 'nope' })).toBeUndefined();
    expect(validateImportRow({ email: 5 })).toBeUndefined();
    expect(validateImportRow(null)).toBeUndefined();
    expect(validateImportRow('x')).toBeUndefined();
  });
  it('coerces non-string optional fields to empty', () => {
    expect(validateImportRow({ email: 'a@b.ch', firstName: 3, confirmAt: {} })?.firstName).toBe('');
  });
});

describe('entryDate', () => {
  it('uses the date of CONFIRM_TIME', () => {
    expect(entryDate('2020-03-14 15:09:26', '20261121')).toBe('20200314');
    expect(entryDate('2020-03-14T15:09:26Z', '20261121')).toBe('20200314');
    expect(entryDate('14.03.2020', '20261121')).toBe('20200314');
  });
  it('falls back to today when empty, unparseable or impossible', () => {
    expect(entryDate('', '20261121')).toBe('20261121');
    expect(entryDate('yesterday', '20261121')).toBe('20261121');
    expect(entryDate('2020-02-31 10:00:00', '20261121')).toBe('20261121');
  });
});

describe('countResult', () => {
  it('maps the outcomes to the summary', () => {
    const s = emptySummary();
    countResult(s, { outcome: 'subscribed', matchedExisting: true });
    countResult(s, { outcome: 'subscribed', matchedExisting: false });
    countResult(s, { outcome: 'alreadySubscribed', matchedExisting: true });
    countResult(s, { outcome: 'ambiguous', matchedExisting: false });
    expect(s).toEqual({ imported: 1, alreadySubscribed: 1, matchedExisting: 1, ambiguous: 1, invalid: 0 });
  });
});

describe('runImport', () => {
  const db = {} as Firestore;
  const base = { tenantId: 't', groupKey: 'g', groupName: 'N', today: '20261121' };

  it('imports with source import and the Mailchimp dates, counts invalid rows, echoes no address', async () => {
    const calls: SubscribeInput[] = [];
    const subscribe = vi.fn(async (_db: Firestore, input: SubscribeInput): Promise<SubscribeResult> => { calls.push(input); return { outcome: 'subscribed', matchedExisting: false }; });
    const rows = [
      { email: 'a@b.ch', firstName: 'A', lastName: 'B', optinAt: '2020-03-14 15:00:00', confirmAt: '2020-03-14 15:09:26' },
      { email: 'a@b.ch', firstName: 'C', lastName: 'D', optinAt: '', confirmAt: '' },
      { email: 'broken', firstName: '', lastName: '', optinAt: '', confirmAt: '' },
    ];
    const summary = await runImport(db, { ...base, rows }, subscribe);
    expect(summary).toEqual({ imported: 2, alreadySubscribed: 0, matchedExisting: 0, ambiguous: 0, invalid: 1 });
    expect(JSON.stringify(summary)).not.toContain('@');
    expect(calls[0]).toMatchObject({ source: 'import', importOptinAt: '2020-03-14 15:00:00', importConfirmAt: '2020-03-14 15:09:26', dateOfEntry: '20200314', city: '' });
    expect(calls[0].claimRef).toBeUndefined();
    expect(calls[1].dateOfEntry).toBe('20261121');
  });

  it('a second import of the same row is alreadySubscribed', async () => {
    const subscribe = vi.fn(async (): Promise<SubscribeResult> => ({ outcome: 'alreadySubscribed', matchedExisting: true }));
    const summary = await runImport(db, { ...base, rows: [{ email: 'a@b.ch' }] }, subscribe);
    expect(summary.alreadySubscribed).toBe(1);
    expect(summary.imported).toBe(0);
  });

  it('a throwing row is counted invalid and does not stop the rest', async () => {
    let n = 0;
    const subscribe = vi.fn(async (): Promise<SubscribeResult> => { if (n++ === 0) throw new Error('boom a@b.ch'); return { outcome: 'ambiguous', matchedExisting: false }; });
    const summary = await runImport(db, { ...base, rows: [{ email: 'a@b.ch' }, { email: 'c@d.ch' }] }, subscribe);
    expect(summary.invalid).toBe(1);
    expect(summary.ambiguous).toBe(1);
  });
});
