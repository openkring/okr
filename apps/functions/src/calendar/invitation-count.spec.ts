import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The server's invitation part of the badge (spec 1.127 §3.7 B1) must count exactly what
// AppStore.openInvitationCount counts: the same query (getSystemQuery + inviteeKey) and the
// shared countableInvitationsOf rule, with the events read as readTenantModel reads them.

const fs = vi.hoisted(() => ({
  invitations: [] as Record<string, unknown>[],
  events: new Map<string, Record<string, unknown>>(),
  filters: [] as unknown[][],
  orderBy: [] as unknown[][],
}));

vi.mock('firebase-admin/firestore', () => {
  const query = {
    where: (...args: unknown[]) => { fs.filters.push(args); return query; },
    orderBy: (...args: unknown[]) => { fs.orderBy.push(args); return query; },
    get: async () => ({ docs: fs.invitations.map((data, i) => ({ id: `i${i}`, data: () => data })) }),
  };
  const db = {
    collection: (name: string) => ({
      ...query,
      doc: (id: string) => ({ path: `${name}/${id}`, id }),
    }),
    getAll: async (...refs: { id: string }[]) =>
      refs.map((r) => ({ exists: fs.events.has(r.id), data: () => fs.events.get(r.id) })),
  };
  return { getFirestore: () => db };
});

import { countOpenInvitations, tenantEventOrNull } from './invitation-count';

const inv = (over: Record<string, unknown> = {}) => ({
  inviteeKey: 'p', state: 'pending', isArchived: false, date: '20991231', caleventKey: 'e1', tenants: ['scs'], ...over,
});
const event = (over: Record<string, unknown> = {}) => ({ startDate: '20991231', tenants: ['scs'], isArchived: false, ...over });

describe('countOpenInvitations', () => {
  beforeEach(() => {
    fs.invitations = [];
    fs.events.clear();
    fs.filters = [];
    fs.orderBy = [];
  });

  it("queries the app's invitations of the person", async () => {
    await countOpenInvitations('p', 'scs');
    expect(fs.filters).toEqual([
      ['isArchived', '==', false],
      ['tenants', 'array-contains-any', ['scs', 'system']],
      ['inviteeKey', '==', 'p'],
    ]);
    expect(fs.orderBy).toEqual([['date', 'asc']]);
  });

  it('counts only answerable invitations', async () => {
    fs.events.set('e1', event());
    fs.events.set('cancelled', event({ state: 'cancelled' }));
    fs.events.set('locked', event({ isLocked: true }));
    fs.invitations = [
      inv(),
      inv({ state: 'accepted' }),
      inv({ isLocked: true }),
      inv({ caleventKey: 'cancelled' }),
      inv({ caleventKey: 'locked' }),
      inv({ caleventKey: 'deleted' }),
      inv({ date: '20000101' }),
      inv({ caleventKey: '' }),
    ];
    expect(await countOpenInvitations('p', 'scs')).toBe(2);
  });

  it("does not count an event of another tenant or an archived one", async () => {
    fs.events.set('e1', event({ tenants: ['kring'] }));
    fs.events.set('e2', event({ isArchived: true }));
    fs.invitations = [inv(), inv({ caleventKey: 'e2' })];
    expect(await countOpenInvitations('p', 'scs')).toBe(0);
  });

  it('is 0 without person or tenant', async () => {
    fs.invitations = [inv()];
    expect(await countOpenInvitations('', 'scs')).toBe(0);
    expect(await countOpenInvitations('p', '')).toBe(0);
  });
});

describe('tenantEventOrNull (mirrors readTenantModel)', () => {
  it('keeps a live event of the tenant or of system', () => {
    expect(tenantEventOrNull(event(), 'scs')).toEqual(event());
    expect(tenantEventOrNull(event({ tenants: ['system'] }), 'scs')).not.toBeNull();
  });
  it('is null for a missing, archived or foreign event', () => {
    expect(tenantEventOrNull(undefined, 'scs')).toBeNull();
    expect(tenantEventOrNull(event({ isArchived: true }), 'scs')).toBeNull();
    expect(tenantEventOrNull(event({ tenants: ['kring'] }), 'scs')).toBeNull();
  });
});

// Cloud Functions run in UTC; the app counts in Europe/Zurich. At 23:30 UTC on 31 Oct 2026 it is
// already 1 Nov 00:30 in Zurich (CET, UTC+1): an invitation dated 31 Oct is past for the app and
// must not be counted by the server either (Task 7 review, fix round 1).
describe('countOpenInvitations counts "today" in Zurich', () => {
  const tz = process.env['TZ'];
  beforeEach(() => {
    fs.invitations = [];
    fs.events.clear();
    process.env['TZ'] = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T23:30:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    if (tz === undefined) delete process.env['TZ'];
    else process.env['TZ'] = tz;
  });

  it('does not count an invitation dated yesterday in Zurich at 23:30 UTC', async () => {
    fs.invitations = [inv({ date: '20261031', caleventKey: '' })];
    expect(await countOpenInvitations('p', 'scs')).toBe(0);
  });

  it('does not count an invitation to an event that ended yesterday in Zurich', async () => {
    fs.events.set('e1', event({ startDate: '20261031' }));
    fs.invitations = [inv({ date: '20261101' })];
    expect(await countOpenInvitations('p', 'scs')).toBe(0);
  });

  it("still counts today's invitation", async () => {
    fs.invitations = [inv({ date: '20261101', caleventKey: '' })];
    expect(await countOpenInvitations('p', 'scs')).toBe(1);
  });
});
