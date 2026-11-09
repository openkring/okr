import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({}), defineString: () => ({}) }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/storage', () => ({ getStorage: vi.fn() }));

import type { PingenClient } from './pingen-client';
import type { MailingPost } from './post-order';
import { reconcilePostVersand, type ReconcileDeps, type ReconMailing } from './reconcile.logic';
import type { SendingRow, SubmitDeps } from './submit-sending.logic';

const OPTIONS = { deliveryProduct: 'cheap', printSpectrum: 'grayscale', printMode: 'simplex' } as const;
const NOW = new Date('2026-11-09T10:00:00.000Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const POST: MailingPost = {
  via: 'pingen', options: OPTIONS, recipients: ['p1', 'p2', 'p3'], letters: 3, abroad: 0, pages: 6, total: 3 * 120 + 6 * 30,
  creditEntryId: 'e1', acceptedBy: 'u', acceptedAt: ago(3),
};
const MAILING: ReconMailing = { id: 'm1', tenantId: 'scs', senderKey: 'pe1', senderName: 'Sandra', subject: 'Einladung', post: POST };

const row = (id: string, over: Partial<SendingRow> = {}): SendingRow => ({
  id, tenants: ['scs'], isArchived: false, channel: 'post', source: 'mailing.m1', recipientKey: 'person.p1', recipientName: `Name ${id}`,
  storagePath: `mailing-letters/scs/m1/${id}.pdf`, options: OPTIONS, pages: 2, price: 180, provider: 'pingen', providerId: 'pg', state: 'queued',
  history: [{ state: 'queued', at: ago(3) }], trackingNumber: '', createdAt: ago(3), updatedAt: ago(3), ...over,
});

function setup(rows: SendingRow[], mailings: ReconMailing[] = [], createLetter?: PingenClient['createLetter']) {
  const store = new Map(rows.map((r) => [r.id, r]));
  const tasks: Array<{ name: string; relatedKey: string }> = [];
  const closedTasks = new Set<string>();
  const reverseShare = vi.fn(async () => ({ amount: 150, duplicate: false }));
  const letter = createLetter ?? vi.fn(async () => ({ id: 'pg1', status: 'valid', filePages: 2, priceValue: 1, priceCurrency: 'CHF' }));
  const deps: ReconcileDeps = {
    client: { createLetter: letter, readOrganisation: vi.fn() } as unknown as PingenClient,
    env: 'production',
    readPdf: vi.fn(async () => Buffer.from('pdf')),
    getSending: async (id) => store.get(id),
    updateSending: async (id, patch, expect) => {
      const cur = store.get(id);
      if (!cur || (expect && cur.state !== expect)) return false;
      store.set(id, { ...cur, ...patch } as SendingRow);
      return true;
    },
    writeCost: async () => undefined,
    setProviderId: async (id, providerId) => { const cur = store.get(id); if (!cur) return false; store.set(id, { ...cur, providerId }); return true; },
    closeOpenTask: async () => undefined,
    loadMailing: async () => ({ senderKey: 'pe1', senderName: 'Sandra', subject: 'Einladung', creditEntryId: 'e1', pagesPerLetter: 2 }),
    countAddressFailures: async () => 0,
    listQueued: async () => [],
    avatar: async (key, _t, name) => ({ key, name1: name, name2: '', modelType: 'person', type: '', subType: '', label: '' }),
    hasOpenTask: async (relatedKey) => tasks.some((t) => t.relatedKey === relatedKey && !closedTasks.has(relatedKey)),
    createTask: async (t) => { tasks.push(t as never); },
    reverseShare,
    now: () => NOW,
    listPostMailings: async () => mailings,
    listSendingIds: async (source) => [...store.values()].filter((r) => r.source === source).map((r) => r.id),
    listByState: async (state) => [...store.values()].filter((r) => r.state === state),
    hasAnyTask: async (relatedKey) => tasks.some((t) => t.relatedKey === relatedKey),
    fanOut: {
      savePdf: async () => undefined,
      exists: async (id) => store.has(id),
      create: async (id, doc) => { if (store.has(id)) return false; store.set(id, { ...(doc as object), id } as SendingRow); return true; },
      reverseShare,
    },
  };
  return { deps: deps as ReconcileDeps & SubmitDeps, store, tasks, reverseShare, letter, closedTasks };
}

describe('reconcilePostVersand - incomplete fan-out', () => {
  it('tombstones and reverses each charged recipient without a record, one task', async () => {
    const { deps, store, tasks, reverseShare } = setup([row('m1_person.p1', { state: 'submitted', updatedAt: ago(1) })], [MAILING]);
    const counts = await reconcilePostVersand(deps);
    expect(store.get('m1_person.p2')).toMatchObject({ state: 'failed', price: 0 });
    expect(store.get('m1_person.p3')).toMatchObject({ state: 'failed' });
    expect(reverseShare).toHaveBeenCalledTimes(2);
    expect(reverseShare).toHaveBeenCalledWith('scs', 'e1', { units: 1, pages: 2 }, 'm1_person.p2', expect.any(String));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Versand Einladung: 2 Briefe konnten nicht erstellt werden — Betrag zurückerstattet');
    expect(counts).toMatchObject({ mailingsRepaired: 1, lettersReversed: 2 });
  });

  it('is idempotent across runs: no second reversal, no second task', async () => {
    const { deps, tasks, reverseShare } = setup([], [MAILING]);
    await reconcilePostVersand(deps);
    await reconcilePostVersand(deps);
    expect(reverseShare).toHaveBeenCalledTimes(3);
    expect(tasks).toHaveLength(1);
  });

  it('leaves a complete Versand alone', async () => {
    const { deps, reverseShare, tasks } = setup([row('m1_person.p1', { state: 'submitted', updatedAt: ago(1) }), row('m1_person.p2', { state: 'failed' }), row('m1_person.p3', { state: 'sent' })], [MAILING]);
    await reconcilePostVersand(deps);
    expect(reverseShare).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(0);
  });

  it('does nothing for a fractional price (acceptance bug)', async () => {
    const { deps, reverseShare, store } = setup([], [{ ...MAILING, post: { ...POST, total: 1000 } }]);
    await reconcilePostVersand(deps);
    expect(reverseShare).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('a failing Versand does not stop the others', async () => {
    const { deps, reverseShare } = setup([], [MAILING, { ...MAILING, id: 'm2' }]);
    const create = deps.fanOut.create;
    deps.fanOut.create = async (id, doc) => { if (id.startsWith('m1_')) throw new Error('boom'); return create(id, doc); };
    await reconcilePostVersand(deps);
    expect(reverseShare).toHaveBeenCalledTimes(3);
  });
});

describe('reconcilePostVersand - queued', () => {
  it('submits a queued record older than one hour through the submit core', async () => {
    const { deps, store, letter } = setup([row('m1_p1'), row('m1_p2', { createdAt: ago(0.5), updatedAt: ago(0.5) }), row('m1_p3', { state: 'failed' })]);
    const counts = await reconcilePostVersand(deps);
    expect(letter).toHaveBeenCalledTimes(1);
    expect(store.get('m1_p1')?.state).toBe('submitted');
    expect(store.get('m1_p2')?.state).toBe('queued');
    expect(counts.queuedResubmitted).toBe(1);
  });

  it('a retryable failure does not abort the run', async () => {
    const { deps } = setup([row('m1_p1'), row('m1_p2')], [], async () => { throw new Error('storage'); });
    await expect(reconcilePostVersand(deps)).resolves.toMatchObject({ queuedResubmitted: 0 });
  });
});

describe('reconcilePostVersand - submitting', () => {
  it('flags a stuck submitting record once', async () => {
    const { deps, tasks, store } = setup([row('m1_p1', { state: 'submitting', updatedAt: ago(2) }), row('m1_p2', { state: 'submitting', updatedAt: ago(0.2) })]);
    await reconcilePostVersand(deps);
    await reconcilePostVersand(deps);
    expect(tasks.filter((t) => t.relatedKey === 'sending.m1_p1')).toHaveLength(1);
    expect(tasks.some((t) => t.relatedKey === 'sending.m1_p2')).toBe(false);
    expect(store.get('m1_p1')?.state).toBe('submitting');
  });
});

describe('reconcilePostVersand - silent submitted', () => {
  it('one task after 7 days without feedback, never twice, no state change', async () => {
    const old = ago(8 * 24);
    const { deps, tasks, store, closedTasks } = setup([
      row('m1_p1', { state: 'submitted', updatedAt: old }),
      row('m1_p2', { state: 'submitted', updatedAt: ago(24) }),
      row('m1_p3', { state: 'submitted', updatedAt: old, history: [{ state: 'sent', at: old }, { state: 'submitted', at: old }] }),
    ]);
    await reconcilePostVersand(deps);
    closedTasks.add('sending.m1_p1.stale');
    await reconcilePostVersand(deps);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ name: 'Brief an Name m1_p1: keine Rückmeldung von Pingen seit 7 Tagen', relatedKey: 'sending.m1_p1.stale' });
    expect(store.get('m1_p1')?.state).toBe('submitted');
  });
});
