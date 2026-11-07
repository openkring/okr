import { describe, expect, it, vi } from 'vitest';

// The newsRouter tests drive a fake Firestore; articleSlug does not touch it.
const fakeDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb.current }));

import { articleSlug, newsRouter } from './news';

describe('articleSlug', () => {
  it('uses the section name when it has one', () => {
    expect(articleSlug({ name: '20260730news_coupedelajeunesse', okey: 'qwia9mb' }))
      .toBe('20260730news_coupedelajeunesse');
  });

  it('falls back to the document id when the name is empty', () => {
    // 2 of scs\'s 209 article sections carry an empty name; an empty slug makes the article
    // unreachable, because the detail route cannot match a blank path segment.
    expect(articleSlug({ name: '', okey: '645sg5sabenrlhc0t1us' })).toBe('645sg5sabenrlhc0t1us');
  });

  it('treats a whitespace-only name as empty', () => {
    expect(articleSlug({ name: '   ', okey: 'abc' })).toBe('abc');
  });

  it('tolerates a missing name field on a legacy document', () => {
    expect(articleSlug({ okey: 'abc' } as { name: string; okey: string })).toBe('abc');
  });
});

describe('unpublished articles', () => {
  const article = (state: string | undefined, name: string) => ({
    type: 'article', state, name, title: name, tags: '', tenants: ['scs'], isArchived: false,
    content: { htmlContent: '<p>Text</p>' }, properties: {},
  });
  const sections: Record<string, Record<string, unknown>> = {
    live: article('published', 'live'),
    draft: article('draft', 'entwurf'),
    legacy: article(undefined, 'ohne-status'),
  };
  const snap = (id: string, data: Record<string, unknown> | undefined) => ({ id, exists: data !== undefined, data: () => data });

  function query(name?: string) {
    const q = {
      where: (field: string, _op: string, value: string) => query(field === 'name' ? value : name),
      limit: () => q,
      get: async () => {
        const docs = Object.entries(sections)
          .filter(([, data]) => data['name'] === name)
          .map(([id, data]) => ({ id, data: () => data }));
        return { empty: docs.length === 0, docs };
      },
    };
    return q;
  }

  async function get(slug?: string) {
    fakeDb.current = {
      collection: (collection: string) => ({
        where: query().where,
        doc: (id: string) => ({
          __id: id,
          get: async () => snap(id, collection === 'pages'
            ? { tenants: ['scs'], sections: Object.keys(sections) }
            : sections[id]),
        }),
      }),
      getAll: async (...refs: { __id: string }[]) => refs.map(r => snap(r.__id, sections[r.__id])),
    };
    let status = 200;
    let body: unknown;
    const res = {
      set: () => res,
      status: (code: number) => { status = code; return res; },
      json: (b: unknown) => { body = b; return res; },
    };
    await newsRouter({ query: { tenantId: 'scs' }, params: slug ? { slug } : {} } as never, res as never);
    return { status, body };
  }

  it('lists published articles only', async () => {
    const { body } = await get();
    expect((body as { slug: string }[]).map(n => n.slug)).toEqual(['live']);
  });

  it('serves a published article by slug', async () => {
    expect((await get('live')).status).toBe(200);
  });

  it('answers 404 for an unpublished article reached by its name', async () => {
    expect((await get('entwurf')).status).toBe(404);
    expect((await get('ohne-status')).status).toBe(404);
  });

  it('answers 404 for an unpublished article reached by its document id', async () => {
    expect((await get('draft')).status).toBe(404);
  });
});
