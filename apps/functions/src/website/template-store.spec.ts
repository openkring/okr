import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({ current: new Map<string, string>() }));
const getFiles = vi.hoisted(() => vi.fn());

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      getFiles,
    }),
  }),
}));

import { clearTemplateCache, loadTemplates, TemplateMissingError } from './template-store';

const PREFIX = 'websites/scs/templates/v1/';
const MANIFEST = { siteId: 'scs', version: 'v1', sectionTypes: ['article'], fixedPages: ['news'] };

function seed(entries: Record<string, string>) {
  files.current = new Map(Object.entries(entries).map(([k, v]) => [PREFIX + k, v]));
}

beforeEach(() => {
  clearTemplateCache();
  getFiles.mockReset();
  getFiles.mockImplementation(async ({ prefix }: { prefix: string }) => [
    [...files.current.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, body]) => ({ name, download: async () => [Buffer.from(body)] })),
  ]);
});

describe('loadTemplates', () => {
  it('reads the template folder into a TemplateSet', async () => {
    seed({
      'website.json': JSON.stringify(MANIFEST),
      'layout.hbs': '<html>{{main}}</html>',
      'partials/nav.hbs': 'NAV',
      'sections/article.hbs': 'ART',
      'pages/news.hbs': 'NEWS',
    });
    const set = await loadTemplates('scs', 'v1');
    expect(set).toEqual({
      manifest: MANIFEST,
      layout: '<html>{{main}}</html>',
      partials: { nav: 'NAV' },
      sections: { article: 'ART' },
      pages: { news: 'NEWS' },
    });
    expect(getFiles).toHaveBeenCalledWith({ prefix: PREFIX });
  });

  it('caches per siteId@version', async () => {
    seed({ 'website.json': JSON.stringify(MANIFEST), 'layout.hbs': 'L' });
    await loadTemplates('scs', 'v1');
    await loadTemplates('scs', 'v1');
    expect(getFiles).toHaveBeenCalledTimes(1);
  });

  it('fails with a templateMissing problem when website.json is absent', async () => {
    seed({ 'layout.hbs': 'L' });
    const err = await loadTemplates('scs', 'v1').catch((e) => e);
    expect(err).toBeInstanceOf(TemplateMissingError);
    expect(err.problem.code).toBe('templateMissing');
    expect(err.problem.detail).toContain('website.json');
  });

  it.each([
    ['sectionTypes missing', { siteId: 'scs', version: 'v1', fixedPages: [] }],
    ['fixedPages not an array', { siteId: 'scs', version: 'v1', sectionTypes: [], fixedPages: 'news' }],
    ['siteId of another site', { siteId: 'other', version: 'v1', sectionTypes: [], fixedPages: [] }],
    ['version missing', { siteId: 'scs', sectionTypes: [], fixedPages: [] }],
    ['legacyRedirects malformed', { siteId: 'scs', version: 'v1', sectionTypes: [], fixedPages: [], legacyRedirects: [{ from: 'a' }] }],
    ['a JSON array', []],
  ])('fails with a templateMissing problem for an invalid manifest (%s)', async (_label, manifest) => {
    seed({ 'website.json': JSON.stringify(manifest), 'layout.hbs': 'L' });
    const err = await loadTemplates('scs', 'v1').catch((e) => e);
    expect(err).toBeInstanceOf(TemplateMissingError);
    expect(err.problem.code).toBe('templateMissing');
    expect(err.problem.detail).toContain('manifest');
  });

  it('accepts a manifest with valid legacyRedirects', async () => {
    seed({ 'website.json': JSON.stringify({ ...MANIFEST, legacyRedirects: [{ from: 'old', key: 'new' }] }), 'layout.hbs': 'L' });
    await expect(loadTemplates('scs', 'v1')).resolves.toBeDefined();
  });

  it('fails when layout.hbs is absent', async () => {
    seed({ 'website.json': JSON.stringify(MANIFEST) });
    const err = await loadTemplates('scs', 'v1').catch((e) => e);
    expect(err.problem.detail).toContain('layout.hbs');
  });

  it('fails when website.json is not valid JSON', async () => {
    seed({ 'website.json': '{nope', 'layout.hbs': 'L' });
    const err = await loadTemplates('scs', 'v1').catch((e) => e);
    expect(err).toBeInstanceOf(TemplateMissingError);
  });

  it.each([
    ['scs', ''],
    ['scs', '../x'],
    ['scs', 'a..b'],
    ['scs', 'a/b'],
    ['scs', 'a\\b'],
    ['scs', '..'],
    ['', 'v1'],
    ['..', 'v1'],
    ['a/b', 'v1'],
    ['a\\b', 'v1'],
    ['a.b', 'v1'],
  ])('rejects the location %j @ %j before touching Storage', async (siteId, version) => {
    await expect(loadTemplates(siteId, version)).rejects.toBeInstanceOf(TemplateMissingError);
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('accepts a dated version like 20261111-0014-590c07eeb and v1.2', async () => {
    seed({ 'website.json': JSON.stringify(MANIFEST), 'layout.hbs': 'L' });
    await expect(loadTemplates('scs', 'v1')).resolves.toBeDefined();
  });
});
