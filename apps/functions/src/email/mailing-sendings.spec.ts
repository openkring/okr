import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/storage', () => ({ getStorage: vi.fn() }));

import { logger } from 'firebase-functions/v2';
import type { MailingPost } from '../pingen/post-order';
import { lettersResult, makePostFanOut, sendingId, sendingPdfPath, type PostFanOutDeps } from './mailing-sendings';
import type { RenderedLetter } from './mailing-letters';

const OPTIONS = { deliveryProduct: 'cheap', printSpectrum: 'grayscale', printMode: 'simplex' } as const;
const POST: MailingPost = {
  via: 'pingen', options: OPTIONS, recipients: ['p1', 'org.o1'], letters: 2, abroad: 1, pages: 4, total: 2 * 120 + 4 * 30,
  creditEntryId: 'e1', acceptedBy: 'u', acceptedAt: '2026-11-09 10:00:00',
};
const letter = (recipientKey: string, over: Partial<RenderedLetter> = {}): RenderedLetter =>
  ({ recipientKey, recipientName: `N ${recipientKey}`, countryCode: 'CH', pdf: Buffer.from('x'), pages: 2, ...over });

function setup(existing: string[] = [], reverse?: PostFanOutDeps['reverseShare']) {
  const saved: string[] = [];
  const records = new Map<string, Record<string, unknown>>(existing.map((id) => [id, {}]));
  const reverseShare = vi.fn(reverse ?? (async () => ({ amount: 195, duplicate: false })));
  const deps: PostFanOutDeps = {
    savePdf: async (path) => { saved.push(path); },
    exists: async (id) => records.has(id),
    create: async (id, doc) => { if (records.has(id)) return false; records.set(id, doc as unknown as Record<string, unknown>); return true; },
    reverseShare,
  };
  const fan = makePostFanOut({ tenantId: 'scs', mailingKey: 'm1', post: POST, nowIso: '2026-11-09T10:00:00.000Z', deps });
  return { fan, saved, records, reverseShare };
}

describe('makePostFanOut', () => {
  it('stores one PDF and one queued sending per charged recipient', async () => {
    const { fan, saved, records } = setup();
    await fan.onLetter(letter('p1'));
    await fan.onLetter(letter('org.o1', { pages: 2 }));
    await fan.finish();
    expect(saved).toEqual(['mailing-letters/scs/m1/person.p1.pdf', 'mailing-letters/scs/m1/org.o1.pdf']);
    expect(sendingPdfPath('scs', 'm1', 'person.p1')).toBe(saved[0]);
    expect([...records.keys()]).toEqual(['m1_person.p1', 'm1_org.o1']);
    expect(records.get('m1_person.p1')).toMatchObject({
      channel: 'post', source: 'mailing.m1', recipientKey: 'person.p1', recipientName: 'N p1', storagePath: saved[0], options: OPTIONS,
      pages: 2, price: 180, provider: 'pingen', providerId: '', state: 'queued', tenants: ['scs'],
      history: [{ state: 'queued', at: '2026-11-09T10:00:00.000Z' }], createdAt: '2026-11-09T10:00:00.000Z',
    });
  });

  it('prices every record at post.total / post.letters', async () => {
    const { fan, records } = setup();
    await fan.onLetter(letter('p1'));
    expect(records.get('m1_person.p1')?.['price']).toBe(POST.total / POST.letters);
    expect(sendingId('m1', 'person.p1')).toBe('m1_person.p1');
  });

  it('ignores letters of recipients that were not charged and does not reverse them', async () => {
    const { fan, records, reverseShare } = setup();
    await fan.onLetter(letter('p1'));
    await fan.onLetter(letter('org.o1'));
    await fan.onLetter(letter('p9'));
    await fan.finish();
    expect(records.has('m1_person.p9')).toBe(false);
    expect(reverseShare).not.toHaveBeenCalled();
  });

  it('keeps the quoted price when a letter is shorter than the quote and warns', async () => {
    const { fan, records } = setup();
    await fan.onLetter(letter('p1', { pages: 1 }));
    expect(records.get('m1_person.p1')).toMatchObject({ price: 180, pages: 1, state: 'queued' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.objectContaining({ recipient: 'person.p1', quotedPages: 2, renderedPages: 1 }));
  });

  it('does not send a letter longer than the quote: tombstone with failReason, share returned', async () => {
    const { fan, saved, records, reverseShare } = setup();
    await fan.onLetter(letter('p1', { pages: 3 }));
    await fan.onLetter(letter('org.o1'));
    await fan.finish();
    expect(saved).toEqual(['mailing-letters/scs/m1/org.o1.pdf']);
    expect(records.get('m1_person.p1')).toMatchObject({ state: 'failed', failReason: 'other', storagePath: '', price: 0 });
    expect(reverseShare).toHaveBeenCalledTimes(1);
    expect(reverseShare).toHaveBeenCalledWith('scs', 'e1', { units: 1, pages: 2 }, 'm1_person.p1', expect.stringContaining('longer than the quote'));
  });

  it('is idempotent: an existing record is neither overwritten nor re-stored', async () => {
    const { fan, saved, records } = setup(['m1_person.p1']);
    await fan.onLetter(letter('p1'));
    await fan.onLetter(letter('org.o1'));
    await fan.finish();
    expect(saved).toEqual(['mailing-letters/scs/m1/org.o1.pdf']);
    expect(records.get('m1_person.p1')).toEqual({});
  });

  it('skips when create loses a race (ALREADY_EXISTS)', async () => {
    const { records } = setup();
    const deps = { savePdf: async () => undefined, exists: async () => false, create: async () => false, reverseShare: vi.fn() };
    const f = makePostFanOut({ tenantId: 'scs', mailingKey: 'm1', post: POST, nowIso: 'x', deps });
    await expect(f.onLetter(letter('p1'))).resolves.toBeUndefined();
    expect(records.size).toBe(0);
  });

  it('reverses the share of a charged recipient that got no letter', async () => {
    const { fan, reverseShare } = setup();
    await fan.onLetter(letter('p1'));
    await fan.finish();
    expect(reverseShare).toHaveBeenCalledTimes(1);
    expect(reverseShare).toHaveBeenCalledWith('scs', 'e1', { units: 1, pages: 2 }, 'm1_org.o1', expect.any(String));
  });

  it('reverses the share of a charged recipient whose address is now abroad', async () => {
    const { fan, records, reverseShare } = setup();
    await fan.onLetter(letter('p1'));
    await fan.onLetter(letter('org.o1', { countryCode: 'DE' }));
    await fan.finish();
    expect(records.get('m1_org.o1')).toMatchObject({ state: 'failed', storagePath: '' });
    expect(reverseShare).toHaveBeenCalledWith('scs', 'e1', { units: 1, pages: 2 }, 'm1_org.o1', expect.any(String));
  });

  it('does not reverse a recipient whose record exists from an earlier run', async () => {
    const { fan, reverseShare } = setup(['m1_org.o1']);
    await fan.onLetter(letter('p1'));
    await fan.finish();
    expect(reverseShare).not.toHaveBeenCalled();
  });

  it('logs every id and amount when the reversal fails, and carries on', async () => {
    const { fan, reverseShare } = setup([], async () => { throw new Error('unavailable'); });
    await fan.onLetter(letter('p1'));
    await expect(fan.finish()).resolves.toBeUndefined();
    expect(reverseShare).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.objectContaining({
      tenantId: 'scs', mailingKey: 'm1', recipient: 'org.o1', creditEntryId: "e1", amount: 180, pages: 2, key: 'm1_org.o1',
    }));
  });

  it('only() keeps abroad letters in the download', () => {
    const { fan } = setup();
    expect(fan.only(letter('p1', { countryCode: 'CH' }))).toBe(false);
    expect(fan.only(letter('p1', { countryCode: '' }))).toBe(false);
    expect(fan.only(letter('p1', { countryCode: 'DE' }))).toBe(true);
  });
});

describe('tombstone and isolation', () => {
  it('a reversed recipient never gets a record on a re-run', async () => {
    const { fan, records, reverseShare } = setup();
    await fan.onLetter(letter('p1'));
    await fan.finish();
    expect(records.get('m1_org.o1')).toMatchObject({ state: 'failed', storagePath: '', price: 0, pages: 2, history: [{ state: 'failed', detail: 'no letter - share returned' }] });
    expect(reverseShare).toHaveBeenCalledTimes(1);
    const again = makePostFanOut({ tenantId: 'scs', mailingKey: 'm1', post: POST, nowIso: 'x', deps: { savePdf: async () => undefined, exists: async (id) => records.has(id), create: async (id, d) => { if (records.has(id)) return false; records.set(id, d as never); return true; }, reverseShare } });
    await again.onLetter(letter('org.o1'));
    expect(records.get('m1_org.o1')).toMatchObject({ state: 'failed' });
  });

  it('finish skips the reversal when a record exists (lost race)', async () => {
    const reverseShare = vi.fn();
    const f = makePostFanOut({ tenantId: 'scs', mailingKey: 'm1', post: POST, nowIso: 'x', deps: { savePdf: async () => undefined, exists: async () => false, create: async () => false, reverseShare } });
    await f.finish();
    expect(reverseShare).not.toHaveBeenCalled();
  });

  it('an unknown create error skips the reversal and logs', async () => {
    const reverseShare = vi.fn();
    const f = makePostFanOut({ tenantId: 'scs', mailingKey: 'm1', post: POST, nowIso: 'x', deps: { savePdf: async () => undefined, exists: async () => false, create: async () => { throw new Error('boom'); }, reverseShare } });
    await f.finish();
    expect(reverseShare).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.objectContaining({ creditEntryId: 'e1', recipient: expect.any(String), amount: 180 }));
  });

  it('a failing letter does not abort the others and is tombstoned and reversed', async () => {
    const { records, reverseShare } = setup();
    const f = makePostFanOut({ tenantId: 'scs', mailingKey: 'm1', post: POST, nowIso: 'x', deps: {
      savePdf: async (path) => { if (path.includes('person.p1')) throw new Error('disk'); },
      exists: async (id) => records.has(id),
      create: async (id, d) => { if (records.has(id)) return false; records.set(id, d as never); return true; },
      reverseShare,
    } });
    await expect(f.onLetter(letter('p1'))).resolves.toBeUndefined();
    await f.onLetter(letter('org.o1'));
    await f.finish();
    expect(records.get('m1_org.o1')).toMatchObject({ state: 'queued' });
    expect(records.get('m1_person.p1')).toMatchObject({ state: 'failed' });
    expect(reverseShare).toHaveBeenCalledTimes(1);
    expect(reverseShare).toHaveBeenCalledWith('scs', 'e1', { units: 1, pages: 2 }, 'm1_person.p1', expect.any(String));
  });

  it('a fractional price creates no records and reverses nothing', async () => {
    const { records, reverseShare } = setup();
    const f = makePostFanOut({ tenantId: 'scs', mailingKey: 'm1', post: { ...POST, total: 361 }, nowIso: 'x', deps: { savePdf: async () => undefined, exists: async () => false, create: async (id, d) => { records.set(id, d as never); return true; }, reverseShare } });
    await f.onLetter(letter('p1'));
    await f.finish();
    expect(f.invalid).toBe(true);
    expect(records.size).toBe(0);
    expect(reverseShare).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.objectContaining({ total: 361, letters: 2, creditEntryId: 'e1' }));
  });
});

describe('lettersResult', () => {
  it('a Pingen send records the abroad letters as the download', () => {
    expect(lettersResult({ storagePath: 'p', letters: 2, missing: 1 }, 5, true)).toEqual({ state: 'ready', storagePath: 'p', count: 2, missing: 1 });
  });
  it('a Pingen send without abroad letters has nothing to download: none, not failed', () => {
    expect(lettersResult({ storagePath: '', letters: 0, missing: 0 }, 5, true)).toEqual({ state: 'none', count: 0, missing: 0 });
  });
  it('a download Versand without any letter still fails as before', () => {
    expect(lettersResult({ storagePath: '', letters: 0, missing: 2 }, 2, false)).toMatchObject({ state: 'failed', missing: 2 });
    expect(lettersResult(undefined, 3, false)).toMatchObject({ state: 'failed', missing: 3 });
  });
});
