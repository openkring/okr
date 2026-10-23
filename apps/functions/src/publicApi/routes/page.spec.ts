import { describe, it, expect } from 'vitest';

import { articleImageLayout, buildLearningSection, isPublishedPage } from './page';
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
      expect(out).toEqual({ type: 'learning', title: 'Lernraum', subTitle: 'Training', locked: true, topics: [], items: [] });
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
});
