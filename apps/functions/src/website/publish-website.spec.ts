import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import type { PageModel, WebsiteModel } from '@okr/shared-models';
import type { RenderInput, SectionDoc, TemplateSet } from '@okr/cms-website-render';

import type { Firestore } from 'firebase-admin/firestore';

import { loadSiteContent, runPublish, type PublishDeps } from './publish-website';
import { TemplateMissingError } from './template-store';

const SITE = {
  okey: 'scs',
  tenants: ['scs'],
  hostingSite: 'scs-website-54aef',
  domain: 'https://seeclub.org',
  templateVersion: 'v1',
  homePageKey: 'home',
  nav: [{ id: 'n1', type: 'page', label: 'Verein', pageKey: 'verein', slug: 'verein' }],
  footer: [],
} as unknown as WebsiteModel;

const TEMPLATES = { manifest: { siteId: 'scs', version: 'v1', sectionTypes: [], fixedPages: [] }, layout: '', partials: {}, sections: {}, pages: {} } as TemplateSet;
const FILES = [
  { path: 'index.html', content: '<html></html>' },
  { path: 'verein.html', content: '<html></html>' },
  { path: 'sitemap.xml', content: '' },
];

function deps(): PublishDeps & Record<string, ReturnType<typeof vi.fn>> {
  const calls: string[] = [];
  const track = <T>(name: string, value: T) =>
    vi.fn(async () => {
      calls.push(name);
      return value;
    });
  const d = {
    calls,
    acquireLock: track('acquireLock', { id: 'lock1' }),
    closeLock: track('closeLock', undefined),
    loadContent: track('loadContent', { pages: new Map<string, PageModel>(), sections: new Map<string, SectionDoc>() }),
    loadTemplates: track('loadTemplates', TEMPLATES),
    getSanitizer: track('getSanitizer', (html: string) => html),
    renderSite: vi.fn((input: RenderInput) => {
      calls.push('renderSite');
      expect(input.imageUrl('a/b.jpg')).toContain('a/b.jpg');
      return { files: FILES, problems: [] };
    }),
    getLiveVersion: track('getLiveVersion', 'sites/scs-website-54aef/versions/live'),
    cloneStaticAssets: track('cloneStaticAssets', 'sites/scs-website-54aef/versions/new'),
    uploadFiles: track('uploadFiles', undefined),
    finalizeAndRelease: track('finalizeAndRelease', 'sites/scs-website-54aef/releases/r1'),
    markPublished: track('markPublished', undefined),
    now: vi.fn(() => 1000),
  };
  return d as unknown as PublishDeps & Record<string, ReturnType<typeof vi.fn>>;
}

const REQ = { site: SITE, dryRun: false, personKey: 'pA' };
const hostingCalls = (d: ReturnType<typeof deps>) =>
  [d['getLiveVersion'], d['cloneStaticAssets'], d['uploadFiles'], d['finalizeAndRelease']].map((f) => f.mock.calls.length);

describe('runPublish', () => {
  let d: ReturnType<typeof deps>;
  beforeEach(() => {
    d = deps();
  });

  it('refuses with alreadyRunning when the lock is held, touching nothing else', async () => {
    d['acquireLock'].mockResolvedValueOnce(undefined);
    const result = await runPublish(d, REQ);
    expect(result.problems).toEqual([{ code: 'alreadyRunning' }]);
    expect(d['loadContent']).not.toHaveBeenCalled();
    expect(d['closeLock']).not.toHaveBeenCalled();
  });

  it('returns render problems, calls no Hosting API and closes the lock refused', async () => {
    d['renderSite'].mockReturnValueOnce({ files: [], problems: [{ code: 'pageMissing', nodeId: 'n1' }] });
    const result = await runPublish(d, REQ);
    expect(result.problems).toEqual([{ code: 'pageMissing', nodeId: 'n1' }]);
    expect(result.version).toBeUndefined();
    expect(hostingCalls(d)).toEqual([0, 0, 0, 0]);
    expect(d['markPublished']).not.toHaveBeenCalled();
    expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'refused', expect.objectContaining({ problems: [{ code: 'pageMissing', nodeId: 'n1' }] }));
  });

  it('turns a missing template set into a templateMissing problem', async () => {
    d['loadTemplates'].mockRejectedValueOnce(new TemplateMissingError('websites/scs/templates/v1/website.json not found'));
    const result = await runPublish(d, REQ);
    expect(result.problems).toEqual([{ code: 'templateMissing', detail: 'websites/scs/templates/v1/website.json not found' }]);
    expect(d['renderSite']).not.toHaveBeenCalled();
    expect(hostingCalls(d)).toEqual([0, 0, 0, 0]);
    expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'refused', expect.anything());
  });

  it('renders on a dry run but calls no Hosting API and closes the lock dryRun', async () => {
    const result = await runPublish(d, { ...REQ, dryRun: true });
    expect(result).toMatchObject({ files: 3, pages: 2, problems: [] });
    expect(result.version).toBeUndefined();
    expect(hostingCalls(d)).toEqual([0, 0, 0, 0]);
    expect(d['markPublished']).not.toHaveBeenCalled();
    expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'dryRun', expect.objectContaining({ files: 3 }));
  });

  it('refuses noBaseRelease when the Hosting site never released', async () => {
    d['getLiveVersion'].mockResolvedValueOnce(undefined);
    const result = await runPublish(d, REQ);
    expect(result.problems).toEqual([{ code: 'noBaseRelease' }]);
    expect(d['cloneStaticAssets']).not.toHaveBeenCalled();
    expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'refused', expect.anything());
  });

  it('clones, uploads and releases in order, then writes the site fields and closes the lock done', async () => {
    d['now'].mockReturnValueOnce(1000).mockReturnValue(4500);
    const result = await runPublish(d, REQ);
    expect(result).toEqual({ version: 'sites/scs-website-54aef/versions/new', files: 3, pages: 2, durationMs: 3500, problems: [] });
    expect(d['calls']).toEqual([
      'acquireLock',
      'loadContent',
      'loadTemplates',
      'getSanitizer',
      'renderSite',
      'getLiveVersion',
      'cloneStaticAssets',
      'uploadFiles',
      'finalizeAndRelease',
      'markPublished',
      'closeLock',
    ]);
    expect(d['acquireLock']).toHaveBeenCalledWith('scs', 'pA', ['scs']);
    expect(d['loadTemplates']).toHaveBeenCalledWith('scs', 'v1');
    expect(d['cloneStaticAssets']).toHaveBeenCalledWith('scs-website-54aef', 'sites/scs-website-54aef/versions/live');
    expect(d['uploadFiles']).toHaveBeenCalledWith('sites/scs-website-54aef/versions/new', FILES);
    expect(d['finalizeAndRelease']).toHaveBeenCalledWith('scs-website-54aef', 'sites/scs-website-54aef/versions/new', expect.any(String));
    expect(d['markPublished']).toHaveBeenCalledWith('scs', {
      lastPublishedAt: new Date(1000).toISOString(),
      lastPublishedBy: 'pA',
      lastPublishedVersion: 'sites/scs-website-54aef/versions/new',
    });
    expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'done', expect.objectContaining({ version: 'sites/scs-website-54aef/versions/new', files: 3, pages: 2 }));
  });

  it('closes the lock failed with a generic stage, never the raw error text, and throws a bare internal error on a Hosting failure', async () => {
    d['uploadFiles'].mockRejectedValueOnce(new Error('Hosting POST /v1beta1/x:populateFiles failed (503)'));
    const error = await runPublish(d, REQ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('internal');
    expect((error as HttpsError).message).not.toContain('populateFiles');
    expect(d['finalizeAndRelease']).not.toHaveBeenCalled();
    expect(d['markPublished']).not.toHaveBeenCalled();
    expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'failed', { detail: 'hosting', durationMs: expect.any(Number) });
  });

  it('logs a load failure as the generic stage "load"', async () => {
    d['loadContent'].mockRejectedValueOnce(new Error('5 NOT_FOUND: projects/x/databases/(default)/documents/pages/secret'));
    await runPublish(d, REQ).catch(() => undefined);
    expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'failed', { detail: 'load', durationMs: expect.any(Number) });
  });

  it('keeps problem details (template or render error text) out of the log doc but returns them', async () => {
    const problems = [{ code: 'renderFailed' as const, pageKey: 'home', detail: 'Parse error on line 3: {{#each x' }];
    d['renderSite'].mockReturnValueOnce({ files: [], problems });
    const result = await runPublish(d, REQ);
    expect(result.problems).toEqual(problems);
    expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'refused', expect.objectContaining({ problems: [{ code: 'renderFailed', pageKey: 'home' }] }));
  });

  it.each(['scs-app-54aef', '', 'scs-website', 'other-project/sites/x', 'SCS-website-54aef'])(
    'refuses hostingSite %j as hostingSiteInvalid before rendering or any Hosting call',
    async (hostingSite) => {
      const result = await runPublish(d, { ...REQ, site: { ...SITE, hostingSite } as WebsiteModel });
      expect(result.problems).toEqual([{ code: 'hostingSiteInvalid' }]);
      expect(d['renderSite']).not.toHaveBeenCalled();
      expect(hostingCalls(d)).toEqual([0, 0, 0, 0]);
      expect(d['closeLock']).toHaveBeenCalledWith('scs', 'lock1', 'refused', expect.objectContaining({ problems: [{ code: 'hostingSiteInvalid' }] }));
    },
  );

  it('still throws internal when closing the lock fails after an error', async () => {
    d['loadContent'].mockRejectedValueOnce(new Error('firestore down'));
    d['closeLock'].mockRejectedValueOnce(new Error('still down'));
    const error = await runPublish(d, REQ).catch((e: unknown) => e);
    expect((error as HttpsError).code).toBe('internal');
  });
});

describe('loadSiteContent', () => {
  function fakeDb(data: Record<string, Record<string, unknown>>) {
    const reads: string[][] = [];
    const db = {
      collection: (c: string) => ({ doc: (id: string) => ({ path: `${c}/${id}`, id }) }),
      getAll: async (...refs: { path: string; id: string }[]) => {
        reads.push(refs.map((r) => r.path));
        return refs.map((r) => ({ id: r.id, data: () => data[r.path] }));
      },
    };
    return { db: db as unknown as Firestore, reads };
  }
  const site = {
    ...SITE,
    nav: [
      { id: 'n1', type: 'page', label: 'Verein', pageKey: 'verein', slug: 'verein' },
      { id: 'n2', type: 'page', label: 'Fremd', pageKey: 'foreign', slug: 'fremd' },
      { id: 'n3', type: 'menu', label: 'Menu', children: [{ id: 'n4', type: 'page', label: 'Alt', pageKey: 'old', slug: 'alt', isArchived: true }] },
    ],
  } as unknown as WebsiteModel;

  it('loads the tree pages of the site tenants, their sections (@TID@ resolved) and accordion items, in batches', async () => {
    const pub = { tenants: ['scs'], state: 'published' };
    const { db, reads } = fakeDb({
      'pages/home': { tenants: ['scs'], sections: ['@TID@_hero'] },
      'pages/verein': { tenants: ['scs'], sections: ['acc'] },
      'pages/foreign': { tenants: ['other'], sections: ['secret'] },
      'pages/old': { tenants: ['scs'], isArchived: true, sections: [] },
      'sections/scs_hero': { ...pub, type: 'hero' },
      'sections/acc': { ...pub, type: 'accordion', properties: { items: [{ key: 'item1' }, { key: 7 }] } },
      'sections/item1': { ...pub, type: 'article' },
    });
    const { pages, sections } = await loadSiteContent(db, site);
    expect([...pages.keys()].sort()).toEqual(['home', 'old', 'verein']);
    expect(pages.get('verein')?.okey).toBe('verein');
    expect([...sections.keys()].sort()).toEqual(['acc', 'item1', 'scs_hero']);
    expect(reads).toHaveLength(3);
    expect(reads[0].sort()).toEqual(['pages/foreign', 'pages/home', 'pages/old', 'pages/verein']);
    expect(reads.flat()).not.toContain('sections/secret');
  });
});
