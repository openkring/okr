import { describe, expect, it, vi } from 'vitest';

let read: () => Promise<{ data: () => Record<string, unknown> | undefined }>;
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: () => read() }) }) }),
}));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { getEmailProvider } from './email-templates';

describe('getEmailProvider', () => {
  it('returns the stored provider of the tenant', async () => {
    read = async () => ({ data: () => ({ emailProvider: 'netzone_smtp' }) });
    expect(await getEmailProvider('t')).toBe('netzone_smtp');
  });

  it('returns the default when the field or the document is missing', async () => {
    read = async () => ({ data: () => ({}) });
    expect(await getEmailProvider('t')).toBe('mailtrap_api');
    read = async () => ({ data: () => undefined });
    expect(await getEmailProvider('t')).toBe('mailtrap_api');
  });

  it('returns the default for an unknown stored value', async () => {
    read = async () => ({ data: () => ({ emailProvider: 'nonsense' }) });
    expect(await getEmailProvider('t')).toBe('mailtrap_api');
  });

  it('does not throw when the read fails', async () => {
    read = async () => { throw new Error('unavailable'); };
    expect(await getEmailProvider('t')).toBe('mailtrap_api');
  });
});
