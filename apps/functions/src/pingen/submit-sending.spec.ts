import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({}), defineString: () => ({}) }));

import { logger } from 'firebase-functions/v2';
import { PingenError, type PingenClient } from './pingen-client';
import { failSending, isAddressFailure, sendingFileName, submitSending, type SubmitDeps, type SendingRow } from './submit-sending.logic';

const OPTIONS = { deliveryProduct: 'cheap', printSpectrum: 'grayscale', printMode: 'simplex' } as const;
const NOW = new Date('2026-11-09T10:00:00.000Z');

const row = (id: string, over: Partial<SendingRow> = {}): SendingRow => ({
  id, tenants: ['scs'], isArchived: false, channel: 'post', source: 'mailing.m1', recipientKey: id.split('_')[1] ?? 'p1',
  recipientName: `Name ${id}`, storagePath: `mailing-letters/scs/m1/${id.split('_')[1]}.pdf`, options: OPTIONS, pages: 2, price: 180,
  provider: 'pingen', providerId: '', state: 'queued', history: [{ state: 'queued', at: 'x' }], trackingNumber: '', createdAt: 'x', updatedAt: 'x', ...over,
});

function setup(rows: SendingRow[], createLetter?: PingenClient['createLetter'], env: 'staging' | 'production' = 'production') {
  const store = new Map(rows.map((r) => [r.id, r]));
  const costs = new Map<string, unknown>();
  const tasks: Array<{ name: string; relatedKey: string; relatedModelType: string; linkKey?: string; assignee: { key: string } }> = [];
  const reverseShare = vi.fn(async () => ({ amount: 150, duplicate: false }));
  const letter = createLetter ?? vi.fn(async () => ({ id: 'pg1', status: 'valid', filePages: 2, priceValue: 1.05, priceCurrency: 'CHF' }));
  const deps: SubmitDeps = {
    client: { createLetter: letter, readOrganisation: vi.fn() } as unknown as PingenClient,
    env,
    readPdf: vi.fn(async () => Buffer.from('pdf')),
    getSending: async (id) => store.get(id),
    updateSending: async (id, patch, expect) => {
      const cur = store.get(id);
      if (!cur || (expect && cur.state !== expect)) return false;
      store.set(id, { ...cur, ...patch } as SendingRow);
      return true;
    },
    writeCost: async (id, cost) => { costs.set(id, cost); },
    loadMailing: async () => ({ senderKey: 'pe1', senderName: 'Sandra Sender', subject: 'Einladung', creditEntryId: 'e1', pagesPerLetter: 2 }),
    countAddressFailures: async (source) => [...store.values()].filter((r) => r.source === source && r.state === 'failed' && r.failReason === 'address').length,
    listQueued: async (source) => [...store.values()].filter((r) => r.source === source && r.state === 'queued'),
    avatar: async (key, _t, name) => ({ key, name1: name, name2: '', modelType: 'person', type: '', subType: '', label: '' }),
    hasOpenTask: async (relatedKey) => tasks.some((t) => t.relatedKey === relatedKey),
    createTask: async (t) => { tasks.push(t as never); },
    reverseShare,
    now: () => NOW,
  };
  return { deps, store, costs, tasks, reverseShare, letter };
}

describe('submitSending', () => {
  it('submits with providerId, keeps our page count and writes the cost sub-doc', async () => {
    const { deps, store, costs } = setup([row('m1_p1')]);
    await submitSending(deps, 'm1_p1');
    const r = store.get('m1_p1')!;
    expect(r.state).toBe('submitted');
    expect(r.providerId).toBe('pg1');
    expect(r.pages).toBe(2);
    expect(r.history.at(-1)).toMatchObject({ state: 'submitted', at: NOW.toISOString() });
    expect(costs.get('m1_p1')).toEqual({ providerPrice: 105, currency: 'CHF' });
  });

  it('warns when Pingen counts other pages but keeps ours', async () => {
    const { deps, store } = setup([row('m1_p1')], async () => ({ id: 'pg1', status: 'valid', filePages: 3, priceValue: 1, priceCurrency: 'CHF' }));
    await submitSending(deps, 'm1_p1');
    expect(store.get('m1_p1')!.pages).toBe(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('sends the record id as Idempotency-Key and the PDF it read', async () => {
    const { deps, letter } = setup([row('m1_p1')]);
    await submitSending(deps, 'm1_p1');
    expect(letter).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'm1_p1', fileName: 'm1_p1.pdf', options: OPTIONS }));
    expect(deps.readPdf).toHaveBeenCalledWith('mailing-letters/scs/m1/p1.pdf');
  });

  it('uses the recipient name as file name on staging', async () => {
    const { deps, letter } = setup([row('m1_p1', { recipientName: 'Max Muster' })], undefined, 'staging');
    await submitSending(deps, 'm1_p1');
    expect(letter).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'Max Muster.pdf' }));
  });

  it('rethrows a retryable error and leaves the record queued', async () => {
    const { deps, store, tasks, reverseShare } = setup([row('m1_p1')], async () => { throw new PingenError('Pingen 503', 503, true); });
    await expect(submitSending(deps, 'm1_p1')).rejects.toThrow('Pingen 503');
    expect(store.get('m1_p1')!.state).toBe('queued');
    expect(tasks).toHaveLength(0);
    expect(reverseShare).not.toHaveBeenCalled();
  });

  it('rethrows a storage read failure', async () => {
    const { deps, store } = setup([row('m1_p1')]);
    deps.readPdf = async () => { throw new Error('storage down'); };
    await expect(submitSending(deps, 'm1_p1')).rejects.toThrow('storage down');
    expect(store.get('m1_p1')!.state).toBe('queued');
  });

  it('a non-retryable error fails the record, opens one task and reverses the share by record id', async () => {
    const { deps, store, tasks, reverseShare } = setup([row('m1_p1')], async () => { throw new PingenError('Pingen POST -> 422 invalid address', 422, false); });
    await submitSending(deps, 'm1_p1');
    const r = store.get('m1_p1')!;
    expect(r.state).toBe('failed');
    expect(r.failReason).toBe('address');
    expect(r.history.at(-1)?.detail).toBe('Pingen POST -> 422 invalid address');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ name: 'Brief an Name m1_p1 konnte nicht per Post verschickt werden', relatedModelType: 'sending', relatedKey: 'sending.m1_p1', linkKey: 'mailing.m1', assignee: { key: 'pe1' } });
    expect(reverseShare).toHaveBeenCalledWith('scs', 'e1', { units: 1, pages: 2 }, 'm1_p1', expect.any(String));
  });

  it('does nothing for a record that is not queued (retry after success, tombstone)', async () => {
    const { deps, letter } = setup([row('m1_p1', { state: 'submitted' }), row('m1_p2', { state: 'failed', storagePath: '' })]);
    await submitSending(deps, 'm1_p1');
    await submitSending(deps, 'm1_p2');
    await submitSending(deps, 'missing');
    expect(letter).not.toHaveBeenCalled();
  });

  it('a failing reversal never throws', async () => {
    const { deps, store } = setup([row('m1_p1')], async () => { throw new PingenError('x 400', 400, false); });
    deps.reverseShare = async () => { throw new Error('credit unavailable'); };
    await expect(submitSending(deps, 'm1_p1')).resolves.toBeUndefined();
    expect(store.get('m1_p1')!.state).toBe('failed');
    expect(logger.error).toHaveBeenCalled();
  });

  it('holds the rest after three address issues: one Versand task, each share reversed', async () => {
    const ids = ['m1_a', 'm1_b', 'm1_c', 'm1_d', 'm1_e'];
    const { deps, store, tasks, reverseShare } = setup(
      ids.map((i) => row(i)),
      async () => { throw new PingenError('Pingen -> 422 invalid address', 422, false); },
    );
    await submitSending(deps, 'm1_a');
    await submitSending(deps, 'm1_b');
    expect(store.get('m1_d')!.state).toBe('queued');
    await submitSending(deps, 'm1_c');
    expect(store.get('m1_d')!.state).toBe('failed');
    expect(store.get('m1_d')!.failReason).toBe('other');
    expect(store.get('m1_d')!.history.at(-1)?.detail).toBe('angehalten: zu viele Adressfehler');
    expect(store.get('m1_e')!.state).toBe('failed');
    const versand = tasks.filter((t) => t.relatedKey === 'mailing.m1');
    expect(versand).toHaveLength(1);
    expect(versand[0].name).toBe('Versand Einladung: Briefe angehalten — Adressen prüfen');
    // 3 own failures + 2 held, each by its own record id
    expect(reverseShare.mock.calls.map((c: unknown[]) => c[3]).sort()).toEqual([...ids].sort());
    // per-letter tasks only for the three that were refused, not for the held ones
    expect(tasks.filter((t) => t.relatedModelType === 'sending')).toHaveLength(3);
    // a late failure after the hold must not open a second Versand task
    store.set('m1_f', row('m1_f'));
    await submitSending(deps, 'm1_f');
    expect(tasks.filter((t) => t.relatedKey === 'mailing.m1')).toHaveLength(1);
  });

  it('an other failure does not count towards the hold', async () => {
    const { deps, store } = setup(['m1_a', 'm1_b', 'm1_c', 'm1_d'].map((i) => row(i)), async () => { throw new PingenError('Pingen -> 403 forbidden', 403, false); });
    await submitSending(deps, 'm1_a');
    await submitSending(deps, 'm1_b');
    await submitSending(deps, 'm1_c');
    expect(store.get('m1_a')!.failReason).toBe('other');
    expect(store.get('m1_d')!.state).toBe('queued');
  });
});

describe('failSending', () => {
  it('skips the reversal when reverse is false', async () => {
    const { deps, reverseShare, tasks } = setup([row('m1_p1')]);
    await failSending(deps, row('m1_p1'), 'undeliverable', false);
    expect(reverseShare).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('detects address problems', () => {
    expect(isAddressFailure(new PingenError('Pingen POST -> 422 x', 422, false))).toBe(true);
    expect(isAddressFailure(new PingenError('Pingen POST -> 400 x', 400, false))).toBe(true);
    expect(isAddressFailure(new PingenError('Pingen POST -> 404 recipient address missing', 404, false))).toBe(true);
    expect(isAddressFailure(new PingenError('Pingen POST -> 403 forbidden', 403, false))).toBe(false);
    expect(isAddressFailure(new Error('x'))).toBe(false);
  });
  it('sanitises file names', () => {
    expect(sendingFileName('production', 'm1_p/1', 'A/B')).toBe('m1_p_1.pdf');
    expect(sendingFileName('staging', 'id', 'Max "Muster" <x>/y')).toBe('Max Muster x y.pdf');
    expect(sendingFileName('staging', 'id', '  ')).toBe('id.pdf');
  });
});
