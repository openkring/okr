import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import type { SubjectCtx, SubjectDataEntry } from './types';
import { buildBundle } from './gather';

// CONTRACT UPDATE (Task A2 review): SubjectCtx.email is required — three map rows
// (applications, esignList signees, logAuth) can only identify the subject by e-mail.
const ctx: SubjectCtx = { uid: 'u1', personKey: 'p1', parentKey: 'person.p1', tenantId: 'scs', email: 'ann@scs.ch' };

const entry = (over: Partial<SubjectDataEntry>): SubjectDataEntry => ({
  collection: 'x',
  dataClass: 'content',
  find: vi.fn() as unknown as SubjectDataEntry['find'],
  tenantScope: 'tenantsArray',
  onExport: 'full',
  onErasure: 'retain',
  retention: { months: 12, legalBasis: 'test' },
  ...over,
});

describe('buildBundle', () => {
  it('puts full-export rows under their collection name', async () => {
    const bundle = await buildBundle(ctx, [entry({ collection: 'persons' })], async () => [
      { okey: 'p1', firstName: 'Ann' },
    ]);
    expect(bundle.full['persons']).toEqual([{ okey: 'p1', firstName: 'Ann' }]);
  });

  it('reduces index rows to title/date/route only', async () => {
    const e = entry({
      collection: 'documents',
      onExport: 'index',
      indexFields: { title: 'name', date: 'dateOfDocLastUpdated', route: '/document/' },
    });
    const bundle = await buildBundle(ctx, [e], async () => [
      { okey: 'd1', name: 'Statuten', dateOfDocLastUpdated: '20260101', secret: 'nope' },
    ]);
    expect(bundle.index['documents']).toEqual([{ title: 'Statuten', date: '20260101', route: '/document/d1' }]);
  });

  it('never leaks a non-indexed field into an index row', async () => {
    const e = entry({
      collection: 'tasks',
      onExport: 'index',
      indexFields: { title: 'name', date: 'dueDate', route: '/task/' },
    });
    const bundle = await buildBundle(ctx, [e], async () => [
      { okey: 't1', name: 'T', dueDate: '', notes: 'PRIVATE' },
    ]);
    expect(JSON.stringify(bundle.index)).not.toContain('PRIVATE');
  });

  it('skips rows marked onExport none', async () => {
    const fetch = vi.fn(async () => [{ a: 1 }]);
    const bundle = await buildBundle(ctx, [entry({ collection: 'sessions', onExport: 'none' })], fetch);
    expect(bundle.full['sessions']).toBeUndefined();
    expect(bundle.index['sessions']).toBeUndefined();
    // a row marked 'none' must never even be fetched
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stamps the tenant it was generated for', async () => {
    const bundle = await buildBundle(ctx, [], async () => []);
    expect(bundle.tenantId).toBe('scs');
  });

  // Fix round 1: esignList.createdAt (esign.model.ts:48) is a genuine Firestore
  // Timestamp, not a StoreDate string like every other index row's date field.
  // String(timestamp) has no toString override to hit and silently renders
  // "[object Object]" — this is the regression guard for that.
  it('converts a Firestore Timestamp date field to a StoreDate string, not "[object Object]"', async () => {
    const e = entry({
      collection: 'esignList',
      onExport: 'index',
      indexFields: { title: 'documentName', date: 'createdAt', route: '/esign' },
    });
    const createdAt = Timestamp.fromDate(new Date('2026-01-15T10:30:00Z'));
    const bundle = await buildBundle(ctx, [e], async () => [
      { okey: 'e1', documentName: 'Statuten', createdAt },
    ]);
    expect(bundle.index['esignList']).toEqual([
      { title: 'Statuten', date: '20260115', route: '/esign/e1' },
    ]);
  });
});
