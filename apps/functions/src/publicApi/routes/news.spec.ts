import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The newsRouter tests drive a fake Firestore; articleSlug does not touch it.
const fakeDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb.current }));

import { blocksFromClassic, type ArticleLike } from '@okr/shared-models';
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
  const article = (state: string | undefined, name: string, roleNeeded: string | undefined = 'public') => ({
    type: 'article', state, name, title: name, tags: '', tenants: ['scs'], isArchived: false, roleNeeded,
    content: { htmlContent: '<p>Text</p>' }, properties: {},
  });
  const sections: Record<string, Record<string, unknown>> = {
    live: article('published', 'live'),
    open: article('published', 'offen', 'public'),
    draft: article('draft', 'entwurf'),
    legacy: article(undefined, 'ohne-status'),
    members: article('published', 'mitglieder', 'registered'),
    editors: article('published', 'redaktion', 'contentAdmin'),
    norole: (({ roleNeeded: _drop, ...rest }) => rest)(article('published', 'ohne-rolle')),   // eslint-disable-line @typescript-eslint/no-unused-vars
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

  it('lists published public articles only (roleNeeded none or public)', async () => {
    const { body } = await get();
    expect((body as { slug: string }[]).map(n => n.slug)).toEqual(['live', 'offen']);
  });

  it('serves a published article by slug', async () => {
    expect((await get('live')).status).toBe(200);
    expect((await get('offen')).status).toBe(200);
  });

  it('answers 404 for a members-only article, by name and by document id', async () => {
    for (const slug of ['mitglieder', 'redaktion', 'ohne-rolle', 'members', 'editors', 'norole']) {
      expect((await get(slug)).status).toBe(404);
    }
  });

  it('answers 404 for an unpublished article reached by its name', async () => {
    expect((await get('entwurf')).status).toBe(404);
    expect((await get('ohne-status')).status).toBe(404);
  });

  it('answers 404 for an unpublished article reached by its document id', async () => {
    expect((await get('draft')).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Spec 1.173: articles with blocks. An article without blocks is served exactly as before.
// ---------------------------------------------------------------------------------------------------------------------
describe('news articles with blocks (1.173)', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });
  const img = (n: string): Record<string, unknown> => ({ url: `a/${n}.jpg`, altText: n });
  const base = (properties: Record<string, unknown>, htmlContent = '<p>Hallo <b>Welt</b></p>', position = 1): Record<string, unknown> => ({
    type: 'article', state: 'published', name: 'art', title: 'Titel', subTitle: 'Unter', tags: 'a, b', tenants: ['scs'], isArchived: false,
    roleNeeded: 'public', content: { htmlContent, position, colSize: 6 }, properties,
  });

  async function call(data: Record<string, unknown>, slug?: string): Promise<{ status: number; body: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const snap = (id: string, d: Record<string, unknown> | undefined) => ({ id, exists: d !== undefined, data: () => d });
    const query = {
      where: () => query, limit: () => query,
      get: async () => ({ empty: false, docs: [{ id: 'x1', data: () => data }] }),
    };
    fakeDb.current = {
      collection: (collection: string) => ({
        where: query.where,
        doc: (id: string) => ({ __id: id, get: async () => snap(id, collection === 'pages' ? { tenants: ['scs'], sections: ['x1'] } : data) }),
      }),
      getAll: async (...refs: { __id: string }[]) => refs.map(r => snap(r.__id, data)),
    };
    let status = 200;
    let body: unknown;
    const res = { set: () => res, status: (code: number) => { status = code; return res; }, json: (b: unknown) => { body = b; return res; } };
    await newsRouter({ query: { tenantId: 'scs' }, params: slug ? { slug } : {} } as never, res as never);
    return { status, body };
  }

  const old = base({
    images: [img('a'), img('b')], titleI18n: { en: 'Title' }, datePublished: '20260101',
    contentI18n: { de: '<p>Hallo</p>', en: '<p>Hello <script>x</script></p>' },
  });

  it('an article without blocks is served as before', async () => {
    const detail = (await call(old, 'art')).body;
    const list = (await call(old)).body;
    expect(detail).not.toHaveProperty('blocks');
    expect(list[0]).not.toHaveProperty('blocks');
    expect(detail).toMatchInlineSnapshot(`
      {
        "content": {
          "de": "<p>Hallo</p>",
          "en": "<p>Hello </p>",
        },
        "coverImage": {
          "alt": {
            "de": "a",
          },
          "url": "https://bkaiser.imgix.net/a/a.jpg?auto=compress,format=jpg",
        },
        "date": "2026-01-01",
        "excerpt": {
          "de": "Hallo",
          "en": "Hello x",
        },
        "images": [
          {
            "alt": {
              "de": "a",
            },
            "url": "https://bkaiser.imgix.net/a/a.jpg?auto=compress,format=jpg",
          },
          {
            "alt": {
              "de": "b",
            },
            "url": "https://bkaiser.imgix.net/a/b.jpg?auto=compress,format=jpg",
          },
        ],
        "slug": "art",
        "subTitle": {
          "de": "Unter",
        },
        "tags": [
          "a",
          "b",
        ],
        "title": {
          "en": "Title",
        },
      }
    `);
    expect(list).toMatchInlineSnapshot(`
      [
        {
          "coverImage": {
            "alt": {
              "de": "a",
            },
            "url": "https://bkaiser.imgix.net/a/a.jpg?auto=compress,format=jpg",
          },
          "date": "2026-01-01",
          "excerpt": {
            "de": "Hallo",
            "en": "Hello x",
          },
          "slug": "art",
          "subTitle": {
            "de": "Unter",
          },
          "tags": [
            "a",
            "b",
          ],
          "title": {
            "en": "Title",
          },
        },
      ]
    `);
  });

  it('a migrated article is served like the old one', async () => {
    const cta = { label: 'Los', url: '/los' };
    const cases: Record<string, Record<string, unknown>> = {
      'text only': base({ datePublished: '20260101' }, '<p>Nur Text</p>', 0),
      'image on top': base({ images: [img('a')], contentI18n: { de: '<p>Hallo</p>', en: '<p>Hello</p>' } }, '<p>Hallo</p>', 1),
      'image at the bottom, with a button': base({ images: [img('a')], cta }, '<p>T</p>', 2),
      'image left': base({ images: [img('a')] }, '<p>T</p>', 3),
      'image right': base({ images: [img('a')] }, '<p>T</p>', 4),
      'position absent': { ...base({ images: [img('a')] }), content: { htmlContent: '<p>T</p>' } },
      'two images': base({ images: [img('a'), img('b')] }, '<p>T</p>', 1),
      'two images at the bottom with a layout': base({ images: [img('a'), img('b')], imageLayout: 'stacked' }, '<p>T</p>', 2),
      'side by side': base({ images: [img('a'), img('b')], imageLayout: 'side-by-side' }, '<p>T</p>', 1),
      'a slideshow': base({ images: [img('a'), img('b')], imageLayout: 'slider', slideshow: { effect: 'fade', interval: 3 } }, '<p>T</p>', 1),
      'a layout on one image': base({ images: [img('a')], imageLayout: 'slider' }, '<p>T</p>', 1),
      'contentI18n without images': base({ contentI18n: { de: '<p>Hallo</p>', en: '<p>Hello</p>' } }, '<p>Hallo</p>', 0),
      'the hidden image': base({ images: [img('a')], titleI18n: { en: 'Title' } }, '<p>T</p>', 0),
      'the hidden image and a button': base({ images: [img('a')], cta }, '<p>T</p>', 0),
    };
    for (const [name, doc] of Object.entries(cases)) {
      const { blocks, cover } = blocksFromClassic(doc as ArticleLike);
      const { images: _images, contentI18n: _i18n, cta: _cta, ...kept } = (doc['properties'] ?? {}) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
      const migrated = { ...doc, content: { position: 1 }, properties: { ...kept, blocks, ...(cover ? { cover } : {}) } };
      const [oldDetail, newDetail] = [(await call(doc, 'art')).body, (await call(migrated, 'art')).body];
      expect(newDetail, name).not.toHaveProperty('blocks');
      expect(JSON.stringify(newDetail), name).toBe(JSON.stringify(oldDetail));
      expect(JSON.stringify((await call(migrated)).body), name).toBe(JSON.stringify((await call(doc)).body));
    }
  });

  describe('malformed images', () => {
    const bad = [{ url: 5, altText: 'n' }, { url: '' }, { altText: 'none' }, { url: 'a/ok.jpg', altText: 7 }];
    const blocks = [
      { id: 't', type: 'text', html: '<p>A</p>' },
      ...bad.map((image, i) => ({ id: `i${i}`, type: 'image', image })),
      { id: 'g', type: 'gallery', images: bad },
    ];
    const withBlocks = (extra: Record<string, unknown>) => base({ blocks, ...extra });

    it('do not fail the list or the detail of an article with blocks', async () => {
      for (const doc of [withBlocks({}), withBlocks({ cover: { url: 5 } }), withBlocks({ cover: { altText: 'x' } }), withBlocks({ cover: { url: '' } })]) {
        const list = await call(doc);
        const detail = await call(doc, 'art');
        expect([list.status, detail.status]).toEqual([200, 200]);
        for (const image of [...detail.body.images, list.body[0].coverImage]) expect(image.url).toMatch(/^https:\/\//);
        for (const image of detail.body.images) expect(image.alt.de).toBe('');
      }
    });

    it('the cover skips an unusable cover and takes the first usable image', async () => {
      const [item] = (await call(withBlocks({ cover: { url: 5 } }))).body;
      expect(item.coverImage.url).toContain('a/ok.jpg');
    });

    it('an article without blocks keeps its first image as the cover, even with an empty url', async () => {
      const doc = base({ images: [{ url: '', altText: 'leer' }, img('b')] });
      const [item] = (await call(doc)).body;
      expect(item.coverImage).toEqual({ url: '', alt: { de: 'leer' } });
      expect((await call(doc, 'art')).body.images).toHaveLength(2);
    });
  });

  describe('a free article', () => {
    const blocks = [
      { id: 't', type: 'text', html: '<p>Hallo</p><script>x()</script>', htmlI18n: { en: '<p>Hello</p><img src=x onerror=alert(1)>', fr: '' } },
      { id: 'c', type: 'callout', html: '<p>Achtung</p>', tone: 'primary', htmlI18n: { it: '<p>Attenzione</p><script>y()</script>' } },
      { id: 'i', type: 'image', image: img('pic') },
      { id: 'b', type: 'button', cta: { label: 'Los', url: '/los.html', labelI18n: { en: 'Go', es: '' } } },
      { id: 'd', type: 'divider' },
    ];
    const doc = base({ blocks, cover: img('cover'), images: [img('stale')], datePublished: '20260101' }, '<p>stale</p>');

    it('carries its blocks in every language, sanitized', async () => {
      const body = (await call(doc, 'art')).body;
      expect(body.blocks).toEqual([
        { type: 'text', html: { de: '<p>Hallo</p>', en: '<p>Hello</p><img src="x" />', it: '<p>Hallo</p>' }, align: 'left' },
        { type: 'callout', html: { de: '<p>Achtung</p>', en: '<p>Achtung</p>', it: '<p>Attenzione</p>' }, tone: 'primary' },
        expect.objectContaining({ type: 'image', image: expect.objectContaining({ url: expect.stringContaining('a/pic.jpg') }) }),
        { type: 'button', cta: { label: { de: 'Los', en: 'Go', it: 'Los' }, url: '/los.html', style: 'primary' }, align: 'left' },
        { type: 'divider' },
      ]);
      expect(JSON.stringify(body)).not.toMatch(/script|onerror/);
      expect(body.blocks[2]).not.toHaveProperty('albumOffset');
    });

    it('content, excerpt and images come from the fallback, the cover from articleCover', async () => {
      const body = (await call(doc, 'art')).body;
      expect(body.content.de).toBe('<p>Hallo</p><p>Achtung</p>');
      expect(body.content.it).toBe('<p>Hallo</p><p>Attenzione</p>');
      expect(body.excerpt.de).toMatch(/^Hallo/);
      expect(body.images.map((i: { url: string }) => /\/(\w+)\.jpg/.exec(i.url)?.[1])).toEqual(['cover', 'pic']);
      expect(body.coverImage.url).toContain('a/cover.jpg');
    });

    it('the list carries no blocks, but the cover', async () => {
      const [item] = (await call(doc)).body;
      expect(item).not.toHaveProperty('blocks');
      expect(item.coverImage.url).toContain('a/cover.jpg');
    });

    it('without a cover the first block image is the cover', async () => {
      const { cover: _cover, ...props } = doc['properties'] as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
      const [item] = (await call({ ...doc, properties: props })).body;
      expect(item.coverImage.url).toContain('a/pic.jpg');
    });

    it('serves german only when no block is translated', async () => {
      const body = (await call(base({ blocks: [{ id: 'a', type: 'text', html: '<p>A</p>' }, { id: 'd', type: 'divider' }] }), 'art')).body;
      expect(body.blocks[0]).toEqual({ type: 'text', html: { de: '<p>A</p>' }, align: 'left' });
    });
  });
});
