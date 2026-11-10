import { describe, expect, it, vi } from 'vitest';

import { bumpSitesForPage, bumpSitesForSection, sectionKeyVariants } from './draft-changed.trigger';

interface Fake { id: string; data: Record<string, unknown> }

/** A tiny Firestore double: `pages` (array-contains-any on sections) and `websites` (array-contains on tenants). */
function fakeDb(pages: Fake[], sites: Fake[]) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const db = {
    collection: (name: string) => ({
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          const src = name === 'pages' ? pages : sites;
          const hit = src.filter((d) => {
            const arr = (d.data[field] as string[] | undefined) ?? [];
            return op === 'array-contains' ? arr.includes(value as string) : arr.some((x) => (value as string[]).includes(x));
          });
          return { docs: hit.map((d) => ({ id: d.id, data: () => d.data })) };
        },
      }),
      doc: (id: string) => ({ update: async (data: Record<string, unknown>) => { updates.push({ id, data }); } }),
    }),
  };
  return { db: db as never, updates };
}

const site = (id: string, over: Record<string, unknown> = {}): Fake => ({
  id, data: { tenants: ['scs'], homePageKey: 'home', footer: [], nav: [{ id: 'n1', type: 'page', pageKey: 'p1', children: [{ id: 'n2', type: 'page', pageKey: 'p2' }] }], ...over },
});

describe('bumpSitesForPage', () => {
  it('bumps a site whose tree lists the page, once', async () => {
    const { db, updates } = fakeDb([], [site('w1')]);
    expect(await bumpSitesForPage(db, ['p2'], ['scs'])).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('w1');
    expect(typeof updates[0].data['draftChangedAt']).toBe('string');
  });

  it('bumps for the home page', async () => {
    const { db, updates } = fakeDb([], [site('w1')]);
    await bumpSitesForPage(db, ['home'], ['scs']);
    expect(updates).toHaveLength(1);
  });

  it('writes nothing when no site references the page', async () => {
    const { db, updates } = fakeDb([], [site('w1')]);
    expect(await bumpSitesForPage(db, ['other'], ['scs'])).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('ignores sites of another tenant', async () => {
    const { db, updates } = fakeDb([], [site('w1', { tenants: ['gss'] })]);
    await bumpSitesForPage(db, ['p1'], ['scs']);
    expect(updates).toHaveLength(0);
  });

  it('bumps a site once even when several pages and tenants match', async () => {
    const { db, updates } = fakeDb([], [site('w1', { tenants: ['scs', 'gss'] })]);
    await bumpSitesForPage(db, ['p1', 'p2'], ['scs', 'gss']);
    expect(updates).toHaveLength(1);
  });
});

describe('bumpSitesForSection', () => {
  it('section on two pages, only one in the tree: one update', async () => {
    const pages = [
      { id: 'p1', data: { tenants: ['scs'], sections: ['s1'] } },
      { id: 'pX', data: { tenants: ['scs'], sections: ['s1'] } },
    ];
    const { db, updates } = fakeDb(pages, [site('w1')]);
    await bumpSitesForSection(db, 's1', ['scs']);
    expect(updates).toHaveLength(1);
  });

  it('finds a page that lists the @TID@ form of the key', async () => {
    const pages = [{ id: 'p1', data: { tenants: ['scs'], sections: ['x_@TID@'] } }];
    const { db, updates } = fakeDb(pages, [site('w1')]);
    await bumpSitesForSection(db, 'x_scs', ['scs']);
    expect(updates).toHaveLength(1);
  });

  it('writes nothing when no page lists the section', async () => {
    const { db, updates } = fakeDb([], [site('w1')]);
    await bumpSitesForSection(db, 's1', ['scs']);
    expect(updates).toHaveLength(0);
  });
});

describe('sectionKeyVariants', () => {
  it('lists the literal key and each @TID@ form', () => {
    expect(sectionKeyVariants('x_scs', ['scs'])).toEqual(['x_scs', 'x_@TID@']);
    expect(sectionKeyVariants('x_gss', ['scs'])).toEqual(['x_gss']);
  });
  it('replaces one occurrence at a time', () => {
    expect(sectionKeyVariants('scs_scs', ['scs'])).toEqual(['scs_scs', '@TID@_scs', 'scs_@TID@']);
  });
});

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
