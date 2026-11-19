import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  courses: [] as unknown[],
  logError: vi.fn(),
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => h.db }));
vi.mock('firebase-functions/v2', () => ({ logger: { error: h.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock('../../forms/course-choice', () => ({ readAnnouncedCourses: async () => h.courses }));
vi.mock('../../calendar/recipients', () => ({ todayStoreDate: () => '20261110' }));

import { coursesRouter } from './courses';

const adult = { key: 'c-adult', name: 'Einsteiger', startDate: '20261201', endDate: '20261215', audience: ['adult'], remaining: 3, isFull: false };
const youth = { key: 'c-youth', name: 'Jugend', startDate: '20261101', endDate: '20261215', audience: ['youth'], remaining: -1, isFull: false };

const events: Record<string, Record<string, unknown>[]> = {
  'c-adult': [{ name: 'Einsteiger', startDate: '20261201', startTime: '18:30', durationMinutes: 90, state: 'definitive' }],
  'c-youth': [
    { name: 'Jugend', startDate: '20261103', startTime: '17:00', state: 'definitive' },
    { name: 'Archiv', startDate: '20261102', startTime: '17:00', isArchived: true },
  ],
};

let wheres: [string, string, unknown][];

function installDb(failEvents = false) {
  wheres = [];
  h.db = {
    collection: (name: string) => {
      expect(name).toBe('calevents');
      const q = {
        where: (f: string, op: string, v: unknown) => { wheres.push([f, op, v]); return q; },
        get: async () => {
          if (failEvents) throw new Error('boom');
          const key = wheres.filter(w => w[0] === 'courseKey').at(-1)?.[2] as string;
          return { docs: (events[key] ?? []).map((d, i) => ({ id: `${key}-${i}`, data: () => d })) };
        },
      };
      return q;
    },
  };
}

async function get(query: Record<string, string>) {
  let status = 200;
  let body: unknown;
  const headers: Record<string, string> = {};
  const res = {
    set: (k: string, v: string) => { headers[k] = v; return res; },
    status: (c: number) => { status = c; return res; },
    json: (b: unknown) => { body = b; return res; },
  };
  await coursesRouter({ query } as never, res as never);
  return { status, body, headers };
}

describe('coursesRouter', () => {
  beforeEach(() => { h.courses = [adult, youth]; h.logError.mockClear(); installDb(); });

  it('answers 400 without tenantId', async () => {
    const r = await get({});
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: { code: 'validation_error', message: 'Missing tenantId' } });
  });

  it('filters by audience', async () => {
    const r = await get({ tenantId: 'scs', audience: 'youth' });
    expect((r.body as { key: string }[]).map(c => c.key)).toEqual(['c-youth']);
  });

  it('reads dates with the two equality filters only', async () => {
    await get({ tenantId: 'scs', audience: 'adult' });
    expect(wheres).toEqual([['tenants', 'array-contains', 'scs'], ['courseKey', '==', 'c-adult']]);
  });

  it('drops archived events in code and exposes only the whitelisted keys', async () => {
    const r = await get({ tenantId: 'scs', audience: 'youth' });
    const course = (r.body as Record<string, unknown>[])[0];
    expect(Object.keys(course).sort()).toEqual(['audience', 'dates', 'endDate', 'isFull', 'key', 'name', 'remaining', 'startDate']);
    expect((course['dates'] as unknown[]).length).toBe(1);
    expect(course['startDate']).toBe('2026-11-01');
  });

  it('sets the short cache header', async () => {
    const r = await get({ tenantId: 'scs' });
    expect(r.headers['Cache-Control']).toBe('public, max-age=60, stale-while-revalidate=120');
  });

  it('answers 500 and logs when the events read fails', async () => {
    installDb(true);
    const r = await get({ tenantId: 'scs' });
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: { code: 'internal_error', message: 'Failed to fetch courses' } });
    expect(h.logError).toHaveBeenCalled();
  });
});
