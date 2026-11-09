import { describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

vi.mock('../email/mailing-letters', () => ({ countLetterPages: vi.fn(), postalOf: vi.fn() }));
vi.mock('../calendar/mail', () => ({ eventWhen: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));

import { resolveAttachmentBytes } from '../email/mailing';
import { makeCreditPort } from './credit-port';
import { draftHashOf, QUOTE_TTL_MS, quoteMailingLettersCore, quoteWithCaller, type QuoteEnv, signQuote, verifyQuote, type QuoteDeps, type QuoteInput, type QuotePayload } from './quote';

const OPTIONS = { deliveryProduct: 'cheap', printSpectrum: 'grayscale', printMode: 'simplex' } as const;
const ADMIN = { roles: { memberAdmin: true }, tenants: ['scs'] };

function setup(countries: (string | undefined)[], pagesPerLetter = 2, balance = 10_000) {
  const quoteTransaction = vi.fn((_p: 'pingen-letter', units: number, pages: number) => ({ total: units * 120 + pages * 30, perUnit: 120, perPage: 30 }));
  const port = makeCreditPort({
    quoteTransaction, readBalance: async () => balance,
    deductCredit: vi.fn(), reverseCredit: vi.fn(),
  });
  const countLetterPages = vi.fn(async () => pagesPerLetter);
  const deps: QuoteDeps = { port, secret: 's3cret', now: 1_000_000, countLetterPages, readCountryCodes: async () => countries };
  const input: QuoteInput = {
    tenantId: 'scs', subject: 'S', body: 'B', attachments: [], letterQrCodes: false, caleventKeys: [],
    postKeys: countries.map((_, i) => `p${i}`), options: OPTIONS,
  };
  return { deps, input, quoteTransaction, countLetterPages };
}

describe('quoteMailingLettersCore', () => {
  it('counts Swiss, abroad and missing separately', async () => {
    const { deps, input } = setup(['CH', 'CH', '', 'DE', undefined]);
    const q = await quoteMailingLettersCore(deps, input, ADMIN);
    expect([q.letters, q.abroad, q.missing]).toEqual([3, 1, 1]);
  });

  it('prices letters x pages through the port', async () => {
    const { deps, input, quoteTransaction } = setup(['CH', 'CH', 'CH', 'DE']);
    const q = await quoteMailingLettersCore(deps, input, ADMIN);
    expect(quoteTransaction).toHaveBeenCalledWith('pingen-letter', 3, 6);
    expect([q.pagesPerLetter, q.pages, q.total]).toEqual([2, 6, 540]);
  });

  it('sufficient is false below the total', async () => {
    const low = await quoteMailingLettersCore(...(() => { const s = setup(['CH', 'CH', 'CH'], 2, 539); return [s.deps, s.input, ADMIN] as const; })());
    expect([low.sufficient, low.balance]).toEqual([false, 539]);
    const ok = await quoteMailingLettersCore(...(() => { const s = setup(['CH', 'CH', 'CH'], 2, 540); return [s.deps, s.input, ADMIN] as const; })());
    expect(ok.sufficient).toBe(true);
  });

  it('renders nothing and prices nothing without a Swiss letter', async () => {
    const { deps, input, countLetterPages, quoteTransaction } = setup(['DE', undefined]);
    const q = await quoteMailingLettersCore(deps, input, ADMIN);
    expect([q.letters, q.pages, q.total, q.sufficient]).toEqual([0, 0, 0, true]);
    expect(countLetterPages).not.toHaveBeenCalled();
    expect(quoteTransaction).not.toHaveBeenCalled();
  });

  it('refuses a group admin and a caller of another tenant', async () => {
    const { deps, input } = setup(['CH']);
    await expect(quoteMailingLettersCore(deps, input, { roles: { groupAdmin: true }, tenants: ['scs'] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(quoteMailingLettersCore(deps, input, { roles: { memberAdmin: true }, tenants: ['other'] })).rejects.toBeInstanceOf(HttpsError);
  });

  it('the token belongs to the quoted letters and recipients', async () => {
    const { deps, input } = setup(['CH', 'CH']);
    const q = await quoteMailingLettersCore(deps, input, ADMIN);
    const again = await quoteMailingLettersCore(deps, input, ADMIN);
    expect(again.token).toBe(q.token);
    const changed = await quoteMailingLettersCore(deps, { ...input, body: 'other' }, ADMIN);
    expect(changed.token).not.toBe(q.token);
  });
});

describe('signQuote / verifyQuote', () => {
  const payload: QuotePayload = { iat: 1000, tenantId: 'scs', draftHash: 'h', recipients: ['b', 'a'], options: OPTIONS, letters: 2, pages: 4, total: 360 };

  it('token verifies for the same payload, whatever the recipient order', () => {
    const token = signQuote(payload, 'k');
    expect(verifyQuote(token, payload, 'k', 1000)).toBe(true);
    expect(verifyQuote(token, { ...payload, recipients: ['a', 'b'] }, 'k', 1000)).toBe(true);
  });

  it('is order- and duplicate-insensitive', () => {
    const token = signQuote(payload, 'k');
    expect(verifyQuote(token, { ...payload, recipients: ['a', 'b', 'a', 'b'] }, 'k', 1000)).toBe(true);
  });

  it('expires after 30 minutes, to the millisecond', () => {
    const token = signQuote(payload, 'k');
    expect(verifyQuote(token, payload, 'k', 1000 + QUOTE_TTL_MS)).toBe(true);
    expect(verifyQuote(token, payload, 'k', 1000 + QUOTE_TTL_MS + 1)).toBe(false);
    expect(verifyQuote(token, payload, 'k', 999)).toBe(false);   // from the future
  });

  it('fails when one recipient, the price or the secret changes', () => {
    const token = signQuote(payload, 'k');
    expect(verifyQuote(token, { ...payload, recipients: ['a', 'c'] }, 'k', 1000)).toBe(false);
    expect(verifyQuote(token, { ...payload, total: 361 }, 'k', 1000)).toBe(false);
    expect(verifyQuote(token, payload, 'other', 1000)).toBe(false);
    expect(verifyQuote('short', payload, 'k', 1000)).toBe(false);
  });
});

describe('makeCreditPort', () => {
  it('maps the 1.149 contract', async () => {
    const reverseCredit = vi.fn(async () => ({ amount: 150, balanceAfter: 1, duplicate: false }));
    const deductCredit = vi.fn(async () => ({ entryId: 'e1', balanceAfter: 5 }));
    const port = makeCreditPort({ quoteTransaction: vi.fn(), readBalance: vi.fn(), deductCredit, reverseCredit });
    await port.deduct('scs', { letters: 3, pages: 6, reference: 'r', actor: 'u' });
    expect(deductCredit).toHaveBeenCalledWith('scs', { product: 'pingen-letter', units: 3, pages: 6, reference: 'r', actor: 'u' });
    expect(await port.reverseShare('scs', 'e1', { units: 1, pages: 2 }, 'k', 'why')).toEqual({ amount: 150, duplicate: false });
    expect(reverseCredit).toHaveBeenCalledWith('scs', 'e1', 'why', { units: 1, pages: 2 }, 'k');
  });
});

describe('attachments', () => {
  it('refuses a storagePath outside the tenant', async () => {
    const read = vi.fn();
    await expect(resolveAttachmentBytes({ storagePath: 'generated-docs/other/x.pdf' }, 'scs', read)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(resolveAttachmentBytes({ storagePath: 'generated-docs/scs/../other/x.pdf' }, 'scs', read)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(read).not.toHaveBeenCalled();
  });

  it('reads a tenant document and inline attachments into memory', async () => {
    const read = vi.fn(async () => ({ content: Buffer.from('doc'), contentType: 'application/pdf' }));
    const got = await resolveAttachmentBytes({ storagePath: 'generated-docs/scs/x.pdf', filename: 'x.pdf', extraAttachments: [{ filename: 'y.txt', contentBase64: Buffer.from('hi').toString('base64') }] }, 'scs', read);
    expect(got.map((a) => [a.filename, a.content.toString(), a.contentType])).toEqual([['x.pdf', 'doc', 'application/pdf'], ['y.txt', 'hi', 'application/octet-stream']]);
  });

  it('hash changes when an attachment\'s contentType changes', () => {
    const base = { subject: 'S', body: 'B', letterQrCodes: false, caleventKeys: [] };
    const att = (t: string) => [{ filename: 'a', contentType: t, content: Buffer.from('x') }];
    expect(draftHashOf({ ...base, attachments: att('application/pdf') })).not.toBe(draftHashOf({ ...base, attachments: att('application/octet-stream') }));
  });

  it('hash changes when an attachment\'s bytes change', () => {
    const base = { subject: 'S', body: 'B', letterQrCodes: false, caleventKeys: [] };
    const att = (c: string) => [{ filename: 'a.pdf', contentType: 'application/pdf', content: Buffer.from(c) }];
    expect(draftHashOf({ ...base, attachments: att('one') })).toBe(draftHashOf({ ...base, attachments: att('one') }));
    expect(draftHashOf({ ...base, attachments: att('one') })).not.toBe(draftHashOf({ ...base, attachments: att('two') }));
  });
});

describe('quoteWithCaller', () => {
  function env(over: Partial<QuoteEnv> = {}) {
    const readDocument = vi.fn(async () => ({ content: Buffer.from('x'), contentType: 'application/pdf' }));
    const e: QuoteEnv = {
      getPort: () => setup(['CH']).deps.port, secret: 'k', now: 5000, readDocument,
      readCountryCodes: async () => ['CH'], answerEventsOf: async () => [], renderPages: async () => 1, ...over,
    };
    return { e, readDocument };
  }
  const data = { tenantId: 'scs', subject: 'S', body: 'B', postKeys: ['p0'] };
  const unbound = (): never => { throw new HttpsError('unavailable', 'credit not configured'); };

  it('an unauthorised caller gets permission-denied, not unavailable, and nothing is read', async () => {
    const { e, readDocument } = env({ getPort: unbound });
    await expect(quoteWithCaller(e, { ...data, storagePath: 'generated-docs/scs/x.pdf' }, { roles: {}, tenants: ['scs'] })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(readDocument).not.toHaveBeenCalled();
  });

  it('an unbound port is unavailable for an authorised caller, before any attachment read', async () => {
    const { e, readDocument } = env({ getPort: unbound });
    await expect(quoteWithCaller(e, { ...data, storagePath: 'generated-docs/scs/x.pdf' }, ADMIN)).rejects.toMatchObject({ code: 'unavailable' });
    expect(readDocument).not.toHaveBeenCalled();
  });

  it('quotes for an authorised caller and returns issuedAt', async () => {
    const { e } = env();
    const q = await quoteWithCaller(e, data, ADMIN);
    expect([q.letters, q.issuedAt]).toEqual([1, 5000]);
  });

  it.each([
    ['extraAttachments not a list', { ...data, extraAttachments: 'x' }],
    ['storagePath not a string', { ...data, storagePath: 5 }],
    ['filename not a string', { ...data, filename: {} }],
    ['tenantId missing', { ...data, tenantId: '' }],
    ['postKeys not a list', { ...data, postKeys: 'p0' }],
  ])('invalid input: %s', async (_name, bad) => {
    await expect(quoteWithCaller(env().e, bad, ADMIN)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
