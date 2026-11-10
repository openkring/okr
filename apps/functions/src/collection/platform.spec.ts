import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { PlatformConfigBillingDocId, PlatformConfigBillingPrivateDocId, PlatformConfigCollection } from '@okr/shared-models';
import { platformBilling } from './platform';

function fakeDb(doc: Record<string, unknown> | undefined, privateDoc?: Record<string, unknown>): { db: Firestore; reads: string[] } {
  const reads: string[] = [];
  const db = {
    collection: (c: string) => ({
      doc: (id: string) => ({
        get: async () => {
          reads.push(`${c}/${id}`);
          const d = id === PlatformConfigBillingPrivateDocId ? privateDoc : doc;
          return { exists: d !== undefined, data: () => d };
        },
      }),
    }),
  } as unknown as Firestore;
  return { db, reads };
}

describe('platformBilling', () => {
  it('returns the values stored in platform-config/billing', async () => {
    const { db, reads } = fakeDb({ operatorTenantId: 'acme', accountingTenantId: 'acme-books' });
    expect(await platformBilling(db)).toEqual({ operatorTenantId: 'acme', accountingTenantId: 'acme-books', excludedUids: [] });
    expect(reads.sort()).toEqual([
      `${PlatformConfigCollection}/${PlatformConfigBillingDocId}`, `${PlatformConfigCollection}/${PlatformConfigBillingPrivateDocId}`,
    ].sort());
  });

  it('defaults to bkg / bkg when the doc is missing', async () => {
    expect(await platformBilling(fakeDb(undefined).db)).toEqual({ operatorTenantId: 'bkg', accountingTenantId: 'bkg', excludedUids: [] });
  });

  it('fills a missing field from the default', async () => {
    expect(await platformBilling(fakeDb({ operatorTenantId: 'acme' }).db)).toEqual({
      operatorTenantId: 'acme',
      accountingTenantId: 'bkg',
      excludedUids: [],
    });
  });

  it('reads excludedUids from the operator-only billing-private doc (P9)', async () => {
    const r = await platformBilling(fakeDb({ operatorTenantId: 'a', accountingTenantId: 'b' }, { excludedUids: ['u1'] }).db);
    expect(r.excludedUids).toEqual(['u1']);
  });

  it('still honours a legacy excludedUids on the public doc until it is moved (union, no duplicates)', async () => {
    const r = await platformBilling(fakeDb({ operatorTenantId: 'a', excludedUids: ['u1', 'u2'] }, { excludedUids: ['u2', 'u3'] }).db);
    expect(r.excludedUids).toEqual(['u2', 'u3', 'u1']);
  });

  it('excludedUids without the public doc: defaults plus the private list', async () => {
    expect(await platformBilling(fakeDb(undefined, { excludedUids: ['u9'] }).db)).toEqual({
      operatorTenantId: 'bkg', accountingTenantId: 'bkg', excludedUids: ['u9'],
    });
  });
});
