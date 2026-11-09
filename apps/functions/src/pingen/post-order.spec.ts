import { describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

vi.mock('../email/mailing-letters', () => ({ countLetterPages: vi.fn(), postalOf: vi.fn() }));
vi.mock('../calendar/mail', () => ({ eventWhen: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));

import { makeCreditPort } from './credit-port';
import { parsePostRequest, type PostOrderArgs, type QuoteEnv, withPostOrder } from './post-order';
import { quoteWithCaller } from './quote';

const ADMIN = { roles: { memberAdmin: true }, tenants: ['scs'] };
const OPTIONS = { deliveryProduct: 'cheap', printSpectrum: 'grayscale', printMode: 'simplex' } as const;

function setup(countries: (string | undefined)[], deduct?: () => Promise<{ entryId: string; balanceAfter: number }>) {
  const deductCredit = vi.fn(deduct ?? (async () => ({ entryId: 'e1', balanceAfter: 5 })));
  const reverseCredit = vi.fn(async () => ({ amount: 1, balanceAfter: 6, duplicate: false }));
  const port = makeCreditPort({
    quoteTransaction: (_p, units, pages) => ({ total: units * 120 + pages * 30, perUnit: 120, perPage: 30 }),
    readBalance: async () => 10_000, deductCredit, reverseCredit,
  });
  const env: QuoteEnv = {
    getPort: () => port, secret: 'k', now: 5000, readCountryCodes: async () => countries,
    answerEventsOf: async () => [], renderPages: async () => 2,
  };
  const request = { tenantId: 'scs', subject: 'S', body: 'B', postKeys: countries.map((_, i) => `p${i}`), options: OPTIONS };
  return { env, deductCredit, reverseCredit, request };
}

async function accepted(env: QuoteEnv, request: object, overrides: Partial<PostOrderArgs> = {}): Promise<PostOrderArgs> {
  const q = await quoteWithCaller(env, request, ADMIN);
  const r = request as typeof request & { tenantId: string; subject: string; body: string; postKeys: string[] };
  return {
    post: { via: 'pingen', options: OPTIONS, token: q.token, issuedAt: q.issuedAt },
    tenantId: r.tenantId, subject: r.subject, body: r.body, attachments: [], letterQrCodes: false, caleventKeys: [], postKeys: r.postKeys,
    mailingKey: 'm1', actor: 'uid1', caller: ADMIN, nowIso: '2026-11-09 10:00:00', ...overrides,
  };
}

describe('withPostOrder', () => {
  it('deducts once with reference mailing.<key> and hands the accepted order to the write', async () => {
    const { env, deductCredit, request } = setup(['CH', 'CH', 'DE', undefined]);
    const work = vi.fn(async () => 'ok');
    expect(await withPostOrder(env, await accepted(env, request), work)).toBe('ok');
    expect(deductCredit).toHaveBeenCalledTimes(1);
    expect(deductCredit).toHaveBeenCalledWith('scs', { product: 'pingen-letter', units: 2, pages: 4, reference: 'mailing.m1', actor: 'uid1' });
    expect(work).toHaveBeenCalledWith({
      via: 'pingen', options: OPTIONS, letters: 2, abroad: 1, pages: 4, total: 360, creditEntryId: 'e1', acceptedBy: 'uid1', acceptedAt: '2026-11-09 10:00:00',
    });
  });

  it('refuses a stale quote: another body, another recipient list, a wrong total', async () => {
    const { env, deductCredit, request } = setup(['CH', 'CH']);
    const args = await accepted(env, request);
    for (const changed of [{ body: 'other' }, { postKeys: ['p0'] }, { letterQrCodes: true, caleventKeys: ['c1'] }, { post: { ...args.post, token: 'x' } }]) {
      await expect(withPostOrder(env, { ...args, ...changed }, vi.fn())).rejects.toMatchObject({ code: 'failed-precondition', message: 'price-changed' });
    }
    expect(deductCredit).not.toHaveBeenCalled();
  });

  it('refuses when the price moved (credit tariff changed since the quote)', async () => {
    const { env, request, deductCredit } = setup(['CH']);
    const args = await accepted(env, request);
    const dearer: QuoteEnv = { ...env, getPort: () => ({ ...env.getPort(), quote: () => ({ total: 999, perUnit: 1, perPage: 1 }) }) };
    await expect(withPostOrder(dearer, args, vi.fn())).rejects.toMatchObject({ message: 'price-changed' });
    expect(deductCredit).not.toHaveBeenCalled();
  });

  it('refuses an expired token', async () => {
    const { env, request } = setup(['CH']);
    const args = await accepted(env, request);
    await expect(withPostOrder({ ...env, now: 5000 + 30 * 60 * 1000 + 1 }, args, vi.fn())).rejects.toMatchObject({ message: 'price-changed' });
  });

  it('passes insufficient credit through as failed-precondition and writes nothing', async () => {
    const { env, request, reverseCredit } = setup(['CH'], async () => { throw new HttpsError('failed-precondition', 'insufficient-credit'); });
    const work = vi.fn();
    await expect(withPostOrder(env, await accepted(env, request), work)).rejects.toMatchObject({ code: 'failed-precondition', message: 'insufficient-credit' });
    expect(work).not.toHaveBeenCalled();
    expect(reverseCredit).not.toHaveBeenCalled();
  });

  it('reverses the whole deduction when the write fails, then rethrows', async () => {
    const { env, request, reverseCredit } = setup(['CH', 'CH', 'CH']);
    const boom = new Error('firestore down');
    await expect(withPostOrder(env, await accepted(env, request), async () => { throw boom; })).rejects.toBe(boom);
    expect(reverseCredit).toHaveBeenCalledTimes(1);
    expect(reverseCredit).toHaveBeenCalledWith('scs', 'e1', 'mailing not stored', { units: 3, pages: 6 }, 'mailing.m1-undo');
    expect(reverseCredit.mock.calls[0][4]).not.toContain('/');
  });

  it('deducts nothing without a Swiss letter: the Post part stays the download', async () => {
    const { env, request, deductCredit } = setup(['DE', undefined]);
    const work = vi.fn(async () => 'ok');
    await withPostOrder(env, await accepted(env, request), work);
    expect(deductCredit).not.toHaveBeenCalled();
    expect(work).toHaveBeenCalledWith(undefined);
  });

  it('fails closed while no credit port is bound, and for a group admin', async () => {
    const { env, request } = setup(['CH']);
    const args = await accepted(env, request);
    const unbound: QuoteEnv = { ...env, getPort: () => { throw new HttpsError('unavailable', 'credit not configured'); } };
    await expect(withPostOrder(unbound, args, vi.fn())).rejects.toMatchObject({ code: 'unavailable' });
    await expect(withPostOrder(env, { ...args, caller: { roles: { groupAdmin: true }, tenants: ['scs'] } }, vi.fn())).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('parsePostRequest', () => {
  it('is absent without post, and normalises the options', () => {
    expect(parsePostRequest(undefined)).toBeUndefined();
    expect(parsePostRequest({ via: 'pingen', options: { printMode: 'duplex', x: 1 }, token: 't', issuedAt: 1 })).toMatchObject({ options: { printMode: 'duplex' }, token: 't', issuedAt: 1 });
  });

  it('refuses anything else', () => {
    expect(() => parsePostRequest({ via: 'other', token: 't', issuedAt: 1 })).toThrow();
    expect(() => parsePostRequest({ via: 'pingen', token: 1, issuedAt: 1 })).toThrow();
    expect(() => parsePostRequest({ via: 'pingen', token: 't' })).toThrow();
  });
});
