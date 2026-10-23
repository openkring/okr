import { describe, it, expect, vi, beforeEach } from 'vitest';

// The pageRouter wiring test drives a fake Firestore; nothing else in this file touches it.
const fakeDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb.current }));

import type { Request, Response } from 'express';

import {
  articleImageLayout, buildLearningSection, isPublicPageRead, isPublishedPage, learningDefaultTab, loadLearningSection, pageCors, pageRouter,
} from './page';
import { getHtmlSanitizer } from '../sanitize';

describe('articleImageLayout', () => {
  it('maps a single image to its ViewPosition', () => {
    expect(articleImageLayout(1, 0, 3).imagePosition).toBe('none');
    expect(articleImageLayout(1, 1, 3).imagePosition).toBe('top');
    expect(articleImageLayout(1, 2, 3).imagePosition).toBe('bottom');
    expect(articleImageLayout(1, 3, 3).imagePosition).toBe('left');
    expect(articleImageLayout(1, 4, 3).imagePosition).toBe('right');
  });

  it('treats a missing or unknown position as none', () => {
    expect(articleImageLayout(1, undefined, 6).imagePosition).toBe('none');
    expect(articleImageLayout(1, 9, 6).imagePosition).toBe('none');
  });

  it('always puts several images on top, whatever the position', () => {
    expect(articleImageLayout(3, 3, 4).imagePosition).toBe('top');
    expect(articleImageLayout(2, 0, 4).imagePosition).toBe('top');
  });

  it('has no image position without images', () => {
    expect(articleImageLayout(0, 1, 6).imagePosition).toBe('none');
  });

  it('uses colSize as the image column width, defaulting to 6', () => {
    expect(articleImageLayout(1, 3, 4).imageColSize).toBe(4);
    expect(articleImageLayout(1, 3, undefined).imageColSize).toBe(6);
    expect(articleImageLayout(1, 3, 0).imageColSize).toBe(6);
    expect(articleImageLayout(1, 3, 12).imageColSize).toBe(6);
  });
});

describe('learning section', () => {
  const section = {
    type: 'learning',
    title: 'Lernraum',
    subTitle: 'Training',
    properties: { folder: 'f1', topics: 'Technik, Taktik,,Technik', curators: [{ tag: 'Technik', personKeys: ['p1'] }], defaultTab: 'files' },
  };
  // Mirrors the real sanitizer's effect on the one thing these tests check.
  const sanitize = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const signVideo = (path: string) => ({ url: `https://signed/${path}?fm=mp4`, posterUrl: `https://signed/${path}?fm=jpg` });
  const doc = (key: string, data: Record<string, unknown>) => ({
    key,
    data: {
      tenants: ['scs'], isArchived: false, folderKeys: ['f1'], tags: '', notes: '', links: [],
      authorName: 'Hans Muster', authorKey: 'p9', ratingCount: 3, ratingSum: 12, ...data,
    },
  });

  it('learning section of a private page returns no material', () => {
    for (const page of [{ isPrivate: true }, {}, { isPrivate: 'false' }, { isPrivate: null }]) {
      expect(isPublishedPage(page)).toBe(false);
      const out = buildLearningSection(section, {
        published: isPublishedPage(page), tenantId: 'scs', sanitize, signVideo,
        docs: [doc('d1', { title: 'A', mimeType: 'application/pdf', fullPath: 'tenant/scs/folder/f1/a.pdf' })],
      });
      expect(out).toEqual({ type: 'learning', title: 'Lernraum', subTitle: 'Training', locked: true, defaultTab: 'files', topics: [], items: [] });
    }
  });

  it('learning notes are sanitised', async () => {
    // The real public-API sanitizer, the same one the articles go through.
    const out = buildLearningSection(section, {
      published: true, tenantId: 'scs', sanitize: await getHtmlSanitizer(), signVideo,
      docs: [doc('d1', {
        title: 'A', mimeType: 'application/pdf', fullPath: 'tenant/scs/folder/f1/a.pdf',
        notes: '<p>ok</p><script>alert(1)</script><img src="https://x/y.png" onerror="alert(2)">',
      })],
    });
    expect(out.items[0].notes).not.toMatch(/script|onerror|alert/);
    expect(out.items[0].notes).toContain('<p>ok</p>');
  });

  it('published room lists folder docs by tab', () => {
    const out = buildLearningSection(section, {
      published: true, tenantId: 'scs', sanitize, signVideo,
      docs: [
        doc('img', { title: 'Bild', mimeType: 'image/jpeg', fullPath: 'tenant/scs/folder/f1/b.jpg', tags: 'Technik, Taktik' }),
        doc('pdf', {
          title: 'Anleitung', mimeType: 'application/pdf', fullPath: 'tenant/scs/folder/f1/a.pdf',
          url: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.pdf?alt=media&token=t',
          links: [{ title: 'Gut', url: 'https://example.org/x' }, { title: 'Unsicher', url: 'http://example.org/y' }, { title: 'JS', url: 'javascript:alert(1)' }],
        }),
        doc('vid', { title: 'Clip', mimeType: 'video/mp4', fullPath: 'tenant/scs/folder/f1/album/learning/c.mp4' }),
        doc('old', { title: 'Archiviert', mimeType: 'application/pdf', fullPath: 'x.pdf', isArchived: true }),
        doc('foreign', { title: 'Fremd', mimeType: 'application/pdf', fullPath: 'x.pdf', tenants: ['p13'] }),
        doc('elsewhere', { title: 'Anderer Ordner', mimeType: 'application/pdf', fullPath: 'x.pdf', folderKeys: ['f2'] }),
      ],
    });
    expect(isPublishedPage({ isPrivate: false })).toBe(true);
    expect(out.locked).toBe(false);
    expect(out.topics).toEqual(['Technik', 'Taktik']);
    expect(out.defaultTab).toBe('files');
    expect(out.items.map(i => [i.key, i.tab])).toEqual([['pdf', 'files'], ['img', 'images'], ['vid', 'videos']]);
    const [pdf, img, vid] = out.items;
    expect(pdf.url).toBe('https://firebasestorage.googleapis.com/v0/b/x/o/a.pdf?alt=media&token=t');
    expect(pdf.links).toEqual([{ title: 'Gut', url: 'https://example.org/x' }]);
    expect(img.url).toMatch(/^https:\/\/bkaiser\.imgix\.net\/tenant\/scs\/folder\/f1\/b\.jpg\?/);
    expect(img.tags).toEqual(['Technik', 'Taktik']);
    expect(vid.url).toBe('https://signed/tenant/scs/folder/f1/album/learning/c.mp4?fm=mp4');
    expect(vid.posterUrl).toBe('https://signed/tenant/scs/folder/f1/album/learning/c.mp4?fm=jpg');
    const json = JSON.stringify(out);
    for (const leak of ['Hans Muster', 'p9', 'ratingCount', 'ratingSum', 'authorName', '"f1"', 'curators']) {
      expect(json).not.toContain(leak);
    }
  });

  it('never signs a video outside the album-video layout', () => {
    const out = buildLearningSection(section, {
      published: true, tenantId: 'scs', sanitize, signVideo,
      docs: [doc('v', { title: 'X', mimeType: 'video/mp4', fullPath: 'tenant/scs/private/invoices/x.mp4' })],
    });
    expect(out.items).toEqual([]);
  });

  const build = (docs: ReturnType<typeof doc>[]) =>
    buildLearningSection(section, { published: true, tenantId: 'scs', sanitize, signVideo, docs });

  it('never signs a video of another room or of a section album', () => {
    const out = build([
      doc('other-room', { title: 'A', mimeType: 'video/mp4', fullPath: 'tenant/scs/folder/f2/album/x/v.mp4' }),
      doc('section', { title: 'B', mimeType: 'video/mp4', fullPath: 'tenant/scs/section/s1/album/x/v.mp4' }),
    ]);
    expect(out.items).toEqual([]);
  });

  it('lists only docs whose first folder is the room (no injection via a second folder key)', () => {
    const out = build([
      doc('injected', { title: 'A', mimeType: 'application/pdf', fullPath: 'tenant/scs/x.pdf', folderKeys: ['other', 'f1'] }),
      doc('own', { title: 'B', mimeType: 'application/pdf', fullPath: 'tenant/scs/y.pdf', folderKeys: ['f1', 'other'] }),
    ]);
    expect(out.items.map(i => i.key)).toEqual(['own']);
  });

  it('skips images outside the tenant storage', () => {
    const out = build([
      doc('foreign', { title: 'A', mimeType: 'image/jpeg', fullPath: 'tenant/p13/folder/f1/a.jpg' }),
      doc('absolute', { title: 'B', mimeType: 'image/jpeg', fullPath: 'https://evil.example/a.jpg' }),
      doc('dots', { title: 'C', mimeType: 'image/jpeg', fullPath: 'tenant/scs/../p13/a.jpg' }),
    ]);
    expect(out.items).toEqual([]);
  });

  it('serves non-image files only from the Firebase download host, else the tenant imgix path', () => {
    const out = build([
      doc('fallback', { title: 'A', mimeType: 'application/pdf', fullPath: 'tenant/scs/folder/f1/a b.pdf', url: 'https://evil.example/a.pdf' }),
      doc('skipped', { title: 'B', mimeType: 'application/pdf', fullPath: 'tenant/p13/b.pdf', url: 'https://evil.example/b.pdf' }),
    ]);
    expect(out.items.map(i => [i.key, i.url])).toEqual([['fallback', 'https://bkaiser.imgix.net/tenant/scs/folder/f1/a%20b.pdf']]);
  });
});

describe('learning section wiring', () => {
  type Call = string;
  function makeDb(o: { page?: Record<string, unknown>; folder?: Record<string, unknown>; docs?: { id: string; data: Record<string, unknown> }[] }) {
    const calls: Call[] = [];
    const learning = { type: 'learning', title: 'Raum', tenants: ['scs'], properties: { folder: 'f1', topics: 'T' } };
    const snap = (id: string, data: Record<string, unknown> | undefined) => ({ id, exists: data !== undefined, data: () => data });
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          __path: `${name}/${id}`,
          get: async () => {
            calls.push(`get ${name}/${id}`);
            if (name === 'pages') return snap(id, o.page);
            if (name === 'folders') return snap(id, o.folder);
            return snap(id, undefined);
          },
        }),
        where: (field: string, op: string, value: string) => ({
          get: async () => {
            calls.push(`query ${name} ${field} ${op} ${value}`);
            return { docs: (o.docs ?? []).map(d => ({ id: d.id, data: () => d.data })) };
          },
        }),
      }),
      getAll: async (...refs: { __path: string }[]) => refs.map(r => {
        calls.push(`getAll ${r.__path}`);
        return snap(r.__path.split('/')[1], ['sections/s1', 'sections/p1'].includes(r.__path) ? learning : undefined);
      }),
    };
    return { db, calls, learning };
  }
  const liveFolder = { tenants: ['scs'], isArchived: false };
  const pdf = { id: 'd1', data: { tenants: ['scs'], folderKeys: ['f1'], title: 'A', mimeType: 'application/pdf', fullPath: 'tenant/scs/a.pdf' } };
  const sanitize = (h: string) => h;

  beforeEach(() => { fakeDb.current = undefined; });

  async function getPage(page: Record<string, unknown>) {
    const m = makeDb({ page: { tenants: ['scs'], type: 'learning', sections: ['p1'], ...page }, folder: liveFolder, docs: [pdf] });
    fakeDb.current = m.db;
    let body: { sections: { locked: boolean; items: unknown[] }[] } | undefined;
    const res = {
      set: () => res,
      status: () => res,
      json: (b: typeof body) => { body = b; return res; },
    };
    await pageRouter({ query: { tenantId: 'scs' }, params: { pageKey: 'p1' } } as never, res as never);
    return { body: body!, calls: m.calls };
  }

  it('an unpublished page runs no docs query (published comes from the page doc)', async () => {
    for (const page of [{ isPrivate: true }, {}]) {
      const { body, calls } = await getPage(page);
      expect(body.sections[0].locked).toBe(true);
      expect(body.sections[0].items).toEqual([]);
      expect(calls.some(c => c.startsWith('query') || c.startsWith('get folders'))).toBe(false);
    }
  });

  it('a published page queries the room folder and lists its docs', async () => {
    const { body, calls } = await getPage({ isPrivate: false });
    expect(body.sections[0].locked).toBe(false);
    expect(body.sections[0].items).toHaveLength(1);
    expect(calls).toContain('get folders/f1');
    expect(calls).toContain('query docs folderKeys array-contains f1');
  });

  it('a non-learning public page listing a learning section gets the locked shell and no docs query', async () => {
    const { body, calls } = await getPage({ isPrivate: false, type: 'content' });
    expect(body.sections[0]).toMatchObject({ locked: true, items: [] });
    expect(calls.some(c => c.startsWith('query') || c.startsWith('get folders'))).toBe(false);
  });

  it('a learning page whose section key differs from the page key gets the locked shell', async () => {
    const { body, calls } = await getPage({ isPrivate: false, sections: ['s1'] });
    expect(body.sections[0]).toMatchObject({ locked: true, items: [] });
    expect(calls.some(c => c.startsWith('query') || c.startsWith('get folders'))).toBe(false);
  });

  it('a public learning page with the matching section key serves the material', async () => {
    const { body } = await getPage({ isPrivate: false, type: 'learning', sections: ['p1'] });
    expect(body.sections[0].locked).toBe(false);
    expect(body.sections[0].items).toHaveLength(1);
  });

  it('a missing, archived, foreign or member-upload room folder gives the locked shell and runs no docs query', async () => {
    for (const folder of [undefined, { ...liveFolder, isArchived: true }, { tenants: ['p13'] }, { ...liveFolder, membersMayUpload: true }]) {
      const m = makeDb({ folder, docs: [pdf] });
      const out = await loadLearningSection(m.db as never, m.learning, true, 'scs', sanitize);
      expect(out).toMatchObject({ locked: true, items: [], topics: [] });
      expect(m.calls.some(c => c.startsWith('query'))).toBe(false);
    }
  });
});

describe('learning section start tab (final review)', () => {
  it('passes a valid configured tab through and falls back to files', () => {
    expect(learningDefaultTab('videos')).toBe('videos');
    expect(learningDefaultTab('images')).toBe('images');
    expect(learningDefaultTab('')).toBe('files');
    expect(learningDefaultTab('<script>')).toBe('files');
    expect(learningDefaultTab(undefined)).toBe('files');
  });
  it('delivers the configured defaultTab on a published room', () => {
    const out = buildLearningSection(
      { type: 'learning', title: 'R', properties: { folder: 'f1', topics: 'T', defaultTab: 'videos' } },
      { published: true, tenantId: 'scs', docs: [], sanitize: h => h, signVideo: () => ({ url: '', posterUrl: '' }) },
    );
    expect(out.defaultTab).toBe('videos');
  });
});

describe('page route CORS (final review)', () => {
  function runCors(method: string, origin: string, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 200, ended: false,
      setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = String(v); },
      getHeader: (k: string) => headers[k.toLowerCase()],
      end: () => { res.ended = true; },
    };
    let nextCalled = false;
    pageCors({ method, headers: { origin, ...extra } } as unknown as Request, res as unknown as Response, () => { nextCalled = true; });
    return { headers, res, nextCalled };
  }
  it('answers a preflight from any tenant app origin: *, GET/OPTIONS, no credentials', () => {
    const { headers, res, nextCalled } = runCors('OPTIONS', 'https://app.kwa.ch', { 'access-control-request-method': 'GET' });
    expect(headers['access-control-allow-origin']).toBe('*');
    expect(headers['access-control-allow-methods']).toBe('GET,OPTIONS');
    expect(headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.statusCode).toBe(204);
    expect(nextCalled).toBe(false);
  });
  it('lets the GET through with Access-Control-Allow-Origin: *', () => {
    const { headers, nextCalled } = runCors('GET', 'https://app.krampfwanderer.ch');
    expect(headers['access-control-allow-origin']).toBe('*');
    expect(nextCalled).toBe(true);
  });
  it('applies only to reads of the page route', () => {
    expect(isPublicPageRead('/public/api/v1/pages/scs_learning_x', 'GET')).toBe(true);
    expect(isPublicPageRead('/public/api/v1/pages/scs_learning_x', 'OPTIONS')).toBe(true);
    expect(isPublicPageRead('/public/api/v1/pages/scs_learning_x', 'POST')).toBe(false);
    expect(isPublicPageRead('/public/api/v1/pagesx', 'GET')).toBe(false);
    expect(isPublicPageRead('/public/api/v1/gallery', 'GET')).toBe(false);
    expect(isPublicPageRead('/public/api/v1/contact', 'OPTIONS')).toBe(false);
  });
});
