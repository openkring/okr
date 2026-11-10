import { describe, it, expect, vi, beforeEach } from 'vitest';

// The pageRouter wiring test drives a fake Firestore; nothing else in this file touches it.
const fakeDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb.current }));

import type { Request, Response } from 'express';

import {
  articleImageLayout, buildLearningSection, mapCta, mapImage, mapSection, normalizeLang, pickText, safeSiteUrl, mapFooter, mapFormSection, isPublicPageRead, isPublishedPage, learningDefaultTab, loadLearningSection, pageCors, pageRouter,
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

describe('mapImage caption', () => {
  const img = { url: 'tenant/scs/a.jpg', label: 'Achter', credit: 'Foto: Muster', overlay: '' };
  const on = { captionPosition: 'bottom' as const };

  it('shows no caption while the section has it switched off (the default)', () => {
    expect(mapImage(img)?.caption).toBe('');
    expect(mapImage({ ...img, overlay: 'Regatta' }, { captionPosition: 'none' })?.caption).toBe('');
  });

  it('a) the image Untertitel, with the Quelle as second line', () => {
    expect(mapImage({ ...img, overlay: ' Regatta 2026 ' }, on)?.caption).toBe('Regatta 2026\nFoto: Muster');
  });

  it('b) the Quelle alone, before any section fallback', () => {
    expect(mapImage(img, on, ['Untertitel', 'Titel'])?.caption).toBe('Foto: Muster');
  });

  it('c) and d) the section subtitle, then the section title — never the image label', () => {
    const bare = { url: 'tenant/scs/a.jpg', label: 'Achter' };
    expect(mapImage(bare, on, ['Untertitel', 'Titel'])?.caption).toBe('Untertitel');
    expect(mapImage(bare, on, ['', 'Titel'])?.caption).toBe('Titel');
    expect(mapImage(bare, on)?.caption).toBe('');
  });

  it('drops an image without url', () => {
    expect(mapImage({ label: 'x' }, on)).toBeUndefined();
  });
});

describe('mapFooter', () => {
  const item = (fields: Record<string, unknown>) => ({ label: '', url: '', icon: '', image: '', height: 'medium', ...fields });

  it('keeps only the visible columns and the bottom line', () => {
    const out = mapFooter({
      columnCount: 2, showBottomLine: true, bottomLine: '© 2026 Seeclub',
      columns: [{ items: [item({ type: 'title', label: 'A' })] }, { items: [] }, { items: [item({ type: 'title', label: 'C' })] }],
    });
    expect(out.columnCount).toBe(2);
    expect(out.columns).toHaveLength(2);
    expect(out.columns[0].items[0]).toMatchObject({ type: 'title', label: 'A' });
    expect(out.bottomLine).toBe('© 2026 Seeclub');
  });

  it('hides the bottom line when switched off and clamps a broken count', () => {
    const out = mapFooter({ columnCount: 9, showBottomLine: false, bottomLine: 'x', columns: [] });
    expect(out.columnCount).toBe(3);
    expect(out.columns.every(c => c.items.length === 0)).toBe(true);
    expect(out.bottomLine).toBe('');
  });

  it('drops unsafe link targets but keeps the words', () => {
    const [js, ok, mail] = mapFooter({ columnCount: 1, columns: [{ items: [
      item({ type: 'link', label: 'Bad', url: 'javascript:alert(1)' }),
      item({ type: 'link', label: 'Impressum', url: 'https://seeclub.org/impressum' }),
      item({ type: 'link', label: 'Mail', url: 'mailto:info@seeclub.org' }),
    ] }] }).columns[0].items;
    expect(js).toMatchObject({ label: 'Bad', url: '' });
    expect(ok.url).toBe('https://seeclub.org/impressum');
    expect(mail.url).toBe('mailto:info@seeclub.org');
  });

  it('resolves icons and logos to urls and rejects odd names and paths', () => {
    const items = mapFooter({ columnCount: 1, columns: [{ items: [
      item({ type: 'icon', icon: 'email', label: 'Mail' }),
      item({ type: 'icon', icon: '../x' }),
      item({ type: 'logo', image: 'tenant/scs/sponsor a.png', height: 'large', label: 'Sponsor' }),
      item({ type: 'logo', image: 'javascript:x' }),
      item({ type: 'logo', image: '' }),
    ] }] }).columns[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].src).toBe('https://bkaiser.imgix.net/logo/icons/email.svg');
    expect(items[1]).toMatchObject({ type: 'logo', height: 72, label: 'Sponsor' });
    expect(items[1].src).toBe('https://bkaiser.imgix.net/tenant/scs/sponsor%20a.png?h=144&auto=format,compress');
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
      expect(out).toEqual({ type: 'learning', name: '', title: 'Lernraum', subTitle: 'Training', locked: true, defaultTab: 'files', topics: [], items: [] });
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
    const learning = { type: 'learning', state: 'published', title: 'Raum', tenants: ['scs'], properties: { folder: 'f1', topics: 'T' } };
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

describe('mapFormSection', () => {
  it('passes the form key and the section id, nothing else of the section', () => {
    const props = {
      formKey: 'mitgliedschaft-beantragen', emailAddresses: ['vorstand@example.ch'], responsibilityKey: 'r1',
      implicitValues: { courseId: 'c1' }, maxResponses: 8,
    };
    expect(mapFormSection('s1', 'Antrag', props)).toEqual({
      type: 'form', title: 'Antrag', sectionId: 's1', formKey: 'mitgliedschaft-beantragen',
    });
  });

  it('gives an empty form key for a section without one', () => {
    expect(mapFormSection('s1', '', {}).formKey).toBe('');
    expect(mapFormSection('s1', '', { formKey: 42 }).formKey).toBe('');
  });
});

describe('unpublished sections', () => {
  const page = { tenants: ['scs'], type: 'content', sections: ['live', 'draft', 'legacy', 'box'] };
  const sections: Record<string, Record<string, unknown>> = {
    live: { type: 'article', state: 'published', tenants: ['scs'], title: 'Live' },
    antrag: { type: 'form', state: 'published', tenants: ['scs'], title: 'Antrag', properties: { formKey: 'f1', emailAddresses: ['a@b.ch'] } },
    draft: { type: 'article', state: 'draft', tenants: ['scs'], title: 'Entwurf' },
    legacy: { type: 'article', tenants: ['scs'], title: 'Ohne Status' },
    box: {
      type: 'accordion', state: 'published', tenants: ['scs'], title: 'Box',
      properties: { items: [{ key: 'nestedLive', label: 'A' }, { key: 'nestedDraft', label: 'B' }, { key: 'nestedArchived', label: 'C' }] },
    },
    nestedLive: { type: 'article', state: 'published', tenants: ['scs'], content: { htmlContent: '<p>offen</p>' } },
    nestedDraft: { type: 'article', state: 'draft', tenants: ['scs'], content: { htmlContent: '<p>Entwurfstext</p>' } },
    nestedArchived: { type: 'article', state: 'published', isArchived: true, tenants: ['scs'], content: { htmlContent: '<p>archiviert</p>' } },
  };
  const snap = (id: string, data: Record<string, unknown> | undefined) => ({ id, exists: data !== undefined, data: () => data });

  async function getSections(pageOverride: Record<string, unknown> = {}) {
    fakeDb.current = {
      collection: (name: string) => ({
        doc: (id: string) => ({ __id: id, get: async () => snap(id, name === 'pages' ? { ...page, ...pageOverride } : undefined) }),
      }),
      getAll: async (...refs: { __id: string }[]) => refs.map(r => snap(r.__id, sections[r.__id])),
    };
    let body: { sections: { title?: string; items?: { label: string; content: string }[] }[] } | undefined;
    const res = { set: () => res, status: () => res, json: (b: typeof body) => { body = b; return res; } };
    await pageRouter({ query: { tenantId: 'scs' }, params: { pageKey: 'p1' } } as never, res as never);
    return body!.sections;
  }

  it('serves a form section with its own document id and without its mail addresses', async () => {
    const sections = await getSections({ sections: ['antrag'] });
    expect(sections).toEqual([{ name: '', type: 'form', title: 'Antrag', sectionId: 'antrag', formKey: 'f1' }]);
  });

  it('serves published sections only, like the app', async () => {
    expect((await getSections()).map(s => s.title)).toEqual(['Live', 'Box']);
  });

  it('never serves the text of an unpublished or archived section inside an accordion', async () => {
    const box = (await getSections()).find(s => s.title === 'Box');
    expect(box?.items).toEqual([
      { label: 'A', content: '<p>offen</p>' },
      { label: 'B', content: '' },
      { label: 'C', content: '' },
    ]);
  });

  it('does not gate on the page: the website pages are isPrivate and in state draft', async () => {
    const titles = (await getSections({ isPrivate: true, state: 'draft' })).map(s => s.title);
    expect(titles).toContain('Live');
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

describe('homepage sections (1.151)', () => {
  const noNested = new Map();
  const id = (h: string) => h;
  const map = (s: Record<string, unknown>, lang = 'de') => mapSection('k', s as never, noNested, id, lang) as Record<string, unknown>;

  it('pickText picks the translation, then the plain text', () => {
    expect(pickText('Über uns', { en: 'About us' }, 'en')).toBe('About us');
    expect(pickText('Über uns', { en: 'About us' }, 'fr')).toBe('Über uns');
    expect(pickText('Neu', { de: 'Alt' }, 'de')).toBe('Neu');
    expect(pickText('', { de: 'Alt' }, 'de')).toBe('Alt');
    expect(pickText('', { en: 'x' }, 'fr')).toBe('x');
    expect(pickText(undefined, undefined, 'de')).toBe('');
  });

  it('normalizeLang accepts the five languages, else de', () => {
    expect(normalizeLang('EN')).toBe('en');
    expect(normalizeLang('xx')).toBe('de');
    expect(normalizeLang(undefined)).toBe('de');
  });

  it('safeSiteUrl allows safe targets and rejects the rest', () => {
    for (const ok of ['https://x.ch', 'mailto:a@b.ch', 'tel:+41', '#kurse', '/app/x', 'termine.html', 'seite.html?key=1#a']) expect(safeSiteUrl(ok)).toBe(ok);
    expect(safeSiteUrl('  #kurse ')).toBe('#kurse');
    for (const bad of ['javascript:alert(1)', '//evil.com', '/\\evil.com', '/\t/evil.com', 'http://x.ch', '../x.html', '#', '', undefined, 5]) expect(safeSiteUrl(bad)).toBe('');
  });

  it('mapCta keeps a safe cta and drops an unsafe or label-less one', () => {
    expect(mapCta({ label: 'Kurs entdecken', url: '#kurse', style: 'primary' }, 'de')).toEqual({ label: 'Kurs entdecken', url: '#kurse', style: 'primary' });
    expect(mapCta({ label: 'x', url: 'javascript:alert(1)', style: 'primary' }, 'de')).toBeUndefined();
    expect(mapCta({ label: 'x', url: '//evil.com', style: 'primary' }, 'de')).toBeUndefined();
    expect(mapCta({ label: '', url: '#a', style: 'primary' }, 'de')).toBeUndefined();
    expect(mapCta({ label: 'Hallo', labelI18n: { en: 'Hi' }, url: '#a', style: 'secondary' }, 'en')?.label).toBe('Hi');
  });

  it('maps a tiles section: items, columns, tones, unsafe urls', () => {
    const out = map({
      type: 'tiles', name: 'zahlen', title: 'Zahlen',
      properties: {
        variant: 'stat', columns: 2, kicker: 'Fakten',
        items: [
          { value: '120', title: 'Mitglieder', tone: 'secondary' },
          { value: '4', title: 'Boote', url: 'javascript:x', icon: 'a b' },
          { value: '9', title: 'Kurse', url: ' kurse.html ', icon: 'boat' },
          { value: '7', title: 'Regatten' },
          { title: 'ohne Wert' },
        ],
      },
    });
    const items = out['items'] as { tone: string; url: string; icon: string }[];
    expect(out).toMatchObject({ type: 'tiles', name: 'zahlen', columns: 2, variant: 'stat', kicker: 'Fakten' });
    expect(items.length).toBe(4);
    expect(items.map(i => i.tone)).toEqual(['secondary', 'primary', 'primary', 'primary']);
    expect(items[1].url).toBe('');
    expect(items[1].icon).toBe('');
    expect(items[2]).toMatchObject({ url: 'kurse.html', icon: 'boat' });
  });

  it('card tiles need a title and columns are clamped, default 3', () => {
    const out = map({ type: 'tiles', properties: { variant: 'card', columns: 9, items: [{ title: 'A' }, { value: '1' }] } });
    expect(out['columns']).toBe(4);
    expect((out['items'] as unknown[]).length).toBe(1);
    expect(map({ type: 'tiles', properties: { items: [] } })['columns']).toBe(3);
  });

  it('every mapped section carries its name', () => {
    for (const type of ['article', 'hero', 'table', 'album', 'button', 'iframe', 'video', 'people', 'accordion', 'footer', 'form', 'tiles', 'events', 'news']) {
      expect(map({ type, name: 'ueber-uns' })['name']).toBe('ueber-uns');
    }
    expect(map({ type: 'article' })['name']).toBe('');
  });

  it('maps events and news sections (not article)', () => {
    expect(map({ type: 'events', properties: { maxEvents: 4, moreUrl: 'termine.html', kicker: 'Agenda' } }))
      .toMatchObject({ type: 'events', maxItems: 4, moreUrl: 'termine.html', kicker: 'Agenda' });
    expect(map({ type: 'news', properties: { maxItems: 3, moreUrl: 'javascript:x' } })).toMatchObject({ type: 'news', maxItems: 3, moreUrl: '' });
  });

  it('hero gets kicker and at most two safe ctas; article gets cta and emphasis', () => {
    const hero = map({ type: 'hero', properties: { kicker: 'Seeclub', ctas: [{ label: 'A', url: '#a', style: 'primary' }, { label: 'B', url: 'http://x', style: 'secondary' }, { label: 'C', url: '#c', style: 'secondary' }] } });
    expect(hero['kicker']).toBe('Seeclub');
    expect(hero['ctas']).toEqual([{ label: 'A', url: '#a', style: 'primary' }]);
    const art = map({ type: 'article', properties: { emphasis: 'banner', cta: { label: 'Mehr', url: 'mehr.html', style: 'primary' } } });
    expect(art).toMatchObject({ emphasis: 'banner', cta: { label: 'Mehr', url: 'mehr.html' } });
  });

  it('threads lang into text and into nested accordion content', () => {
    const nested = new Map([['n1', { content: { htmlContent: '<p>de</p>' }, properties: { contentI18n: { en: '<p>en</p>' } } }]]);
    const out = mapSection('k', { type: 'accordion', title: 'Box', properties: { titleI18n: { en: 'Boxen' }, items: [{ key: 'n1', label: 'A' }] } } as never, nested as never, id, 'en') as { title: string; items: { content: string }[] };
    expect(out.title).toBe('Boxen');
    expect(out.items[0].content).toBe('<p>en</p>');
  });
});
