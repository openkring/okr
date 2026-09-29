import { describe, expect, it } from 'vitest';
import { readFinanceDocument } from './finance-document';

function fakes(docs: Record<string, Record<string, unknown>>, files: Record<string, string>) {
  const db = {
    collection: () => ({ doc: (id: string) => ({ get: async () => ({ data: () => docs[id] }) }) }),
  };
  const bucket = { file: (path: string) => ({ download: async () => [Buffer.from(files[path] ?? '')] }) };
  return { db, bucket } as never as { db: Parameters<typeof readFinanceDocument>[0]; bucket: Parameters<typeof readFinanceDocument>[1] };
}

describe('readFinanceDocument', () => {
  const { db, bucket } = fakes(
    { 'bexio-invoice-1': { tenants: ['scs'], fullPath: 'tenant/scs/private/finance/bexio/bexio-invoice-1.pdf' } },
    { 'tenant/scs/private/finance/bexio/bexio-invoice-1.pdf': 'PDF' },
  );

  it('returns the stored file as base64', async () => {
    expect(await readFinanceDocument(db, bucket, 'bexio-invoice-1', ['scs'])).toBe(Buffer.from('PDF').toString('base64'));
  });
  it('returns null for an empty key or a missing doc', async () => {
    expect(await readFinanceDocument(db, bucket, '', ['scs'])).toBeNull();
    expect(await readFinanceDocument(db, bucket, 'bexio-invoice-2', ['scs'])).toBeNull();
  });
  it('never serves another tenant\'s document', async () => {
    expect(await readFinanceDocument(db, bucket, 'bexio-invoice-1', ['gss'])).toBeNull();
  });
});
