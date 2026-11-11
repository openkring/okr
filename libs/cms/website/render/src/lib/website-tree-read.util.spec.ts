import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { pageKeysInTree, siteWarnings, websiteUrl } from './website-tree-read.util';

const page = (id: string, slug: string, pageKey = `p-${id}`): WebsiteNode => ({ id, type: 'page', label: id, slug, pageKey });
const menu = (id: string, children: WebsiteNode[] = []): WebsiteNode => ({ id, type: 'menu', label: id, children });
const link = (id: string, url: string): WebsiteNode => ({ id, type: 'link', label: id, url });

const tree = (): WebsiteNode[] => [
  menu('m1', [page('a', 'a'), menu('m2', [page('b', 'b')])]),
  page('c', 'c'),
  menu('m3'),
];

describe('pageKeysInTree / websiteUrl', () => {
  it('collects page keys', () => {
    expect(pageKeysInTree(tree())).toEqual(['p-a', 'p-b', 'p-c']);
  });
  it('builds urls', () => {
    expect(websiteUrl(page('a', 'vorstand'))).toBe('/vorstand');
    expect(websiteUrl(link('l', 'mailto:a@b.ch'))).toBe('mailto:a@b.ch');
    expect(websiteUrl(menu('m'))).toBe('');
    expect(websiteUrl({ ...menu('m'), url: ' /termine ' })).toBe('/termine');
  });
});

describe('siteWarnings', () => {
  const site = (nav: WebsiteNode[], footer: WebsiteNode[] = [], homePageKey = 'p-a'): WebsiteModel => {
    return { tenants: ['scs'], nav, footer, homePageKey } as unknown as WebsiteModel;
  };
  const pages = (o: Record<string, Partial<PageModel>>): Map<string, PageModel> =>
    new Map(Object.entries(o).map(([k, v]) => [k, { isArchived: false, isPrivate: false, ...v } as PageModel]));
  const codes = (w: { code: string }[]) => w.map((x) => x.code);

  it('is clean for a healthy site', () => {
    expect(siteWarnings(site([page('a', 'a')]), pages({ 'p-a': {} }))).toEqual([]);
  });
  it('flags missing, archived and private pages', () => {
    const w = siteWarnings(site([page('a', 'a'), page('b', 'b'), page('c', 'c')]), pages({ 'p-b': { isArchived: true }, 'p-c': { isPrivate: true } }));
    expect(w).toContainEqual({ nodeId: 'a', code: 'pageMissing' });
    expect(w).toContainEqual({ nodeId: 'b', code: 'pageArchived' });
    expect(w).toContainEqual({ nodeId: 'c', code: 'pagePrivate' });
  });
  it('treats a page without isPrivate as private (the model default)', () => {
    const p = new Map([['p-a', { isArchived: false } as PageModel]]);
    expect(siteWarnings(site([page('a', 'a')]), p)).toContainEqual({ nodeId: 'a', code: 'pagePrivate' });
  });
  it('does not throw for a site without footer', () => {
    const s = { tenants: ['scs'], nav: [page('a', 'a')], homePageKey: 'p-a' } as unknown as WebsiteModel;
    expect(siteWarnings(s, pages({ 'p-a': {} }))).toEqual([]);
  });
  it('flags duplicate slugs and page keys', () => {
    const w = siteWarnings(site([page('a', 's', 'p-a'), page('b', 's', 'p-b'), page('c', 'c', 'p-a')]), pages({ 'p-a': {}, 'p-b': {} }));
    expect(codes(w)).toContain('slugDuplicate');
    expect(w.filter((x) => x.code === 'pageDuplicate').map((x) => x.nodeId)).toContain('c');
  });
  it('flags invalid links', () => {
    const w = siteWarnings(site([link('l', 'javascript:alert(1)'), link('ok', 'https://a.ch')]), pages({ 'p-a': {} }), );
    expect(w).toEqual([{ nodeId: 'l', code: 'linkInvalid' }]);
  });
  it('checks a menu url only when it is set', () => {
    const withUrl = (id: string, url?: string): WebsiteNode => ({ ...menu(id), url });
    const w = siteWarnings(site([withUrl('none'), withUrl('blank', '  '), withUrl('ok', '/termine'), withUrl('bad', 'javascript:alert(1)')]), pages({}));
    expect(w).toEqual([{ nodeId: 'bad', code: 'linkInvalid' }]);
  });
  it('flags a missing home page', () => {
    expect(codes(siteWarnings(site([], [], ''), pages({})))).toContain('homeMissing');
  });
  it('ignores archived nodes', () => {
    const n: WebsiteNode = { ...page('a', 'a'), isArchived: true };
    expect(siteWarnings(site([n]), pages({}))).toEqual([]);
  });
});
