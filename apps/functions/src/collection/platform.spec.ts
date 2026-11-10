import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { PlatformConfigBillingDocId, PlatformConfigCollection } from '@okr/shared-models';
import { platformBilling } from './platform';

function fakeDb(doc: Record<string, unknown> | undefined): { db: Firestore; reads: string[] } {
  const reads: string[] = [];
  const db = {
    collection: (c: string) => ({
      doc: (id: string) => ({
        get: async () => {
          reads.push(`${c}/${id}`);
          return { exists: doc !== undefined, data: () => doc };
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
    expect(reads).toEqual([`${PlatformConfigCollection}/${PlatformConfigBillingDocId}`]);
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

  it('reads the operator excludedUids list', async () => {
    const r = await platformBilling(fakeDb({ operatorTenantId: 'a', accountingTenantId: 'b', excludedUids: ['u1'] }).db);
    expect(r.excludedUids).toEqual(['u1']);
  });
});
