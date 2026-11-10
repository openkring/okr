import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { validateForPublish, type TemplateManifest } from './publish-validation';
import type { SectionDoc } from './section-mapper';

const manifest: TemplateManifest = { siteId: 's', version: '1', sectionTypes: ['article', 'hero'], fixedPages: [] };
const page = (id: string, slug: string, pageKey = `p-${id}`): WebsiteNode => ({ id, type: 'page', label: id, slug, pageKey });
const site = (nav: WebsiteNode[], homePageKey = 'p-a'): WebsiteModel =>
  ({ tenants: ['scs'], nav, footer: [], homePageKey }) as unknown as WebsiteModel;
const pg = (sections: string[] = [], extra: Partial<PageModel> = {}): PageModel => ({ sections, ...extra }) as unknown as PageModel;

describe('validateForPublish', () => {
  it('is clean for a valid site', () => {
    const pages = new Map([['p-a', pg(['s1'])]]);
    const sections = new Map<string, SectionDoc>([['s1', { type: 'article', state: 'published' }]]);
    expect(validateForPublish(site([page('a', 'a')]), pages, sections, manifest)).toEqual([]);
  });
  it('reuses the tree codes', () => {
    const p = validateForPublish(site([page('a', 'a'), page('b', 'b', 'p-x')]), new Map([['p-a', pg()]]), new Map(), manifest);
    expect(p).toContainEqual({ code: 'pageMissing', nodeId: 'b' });
  });
  it('flags a published section of an unknown type', () => {
    const pages = new Map([['p-a', pg(['s1'])]]);
    const sections = new Map<string, SectionDoc>([['s1', { type: 'weird', state: 'published' }]]);
    expect(validateForPublish(site([page('a', 'a')]), pages, sections, manifest)).toEqual([
      { code: 'templateMissing', pageKey: 'p-a', sectionKey: 's1', detail: 'weird' },
    ]);
  });
  it('ignores a draft section of an unknown type', () => {
    const pages = new Map([['p-a', pg(['s1'])]]);
    const sections = new Map<string, SectionDoc>([['s1', { type: 'weird', state: 'draft' }]]);
    expect(validateForPublish(site([page('a', 'a')]), pages, sections, manifest)).toEqual([]);
  });
  it('counts the home page though it is not in the nav', () => {
    const pages = new Map([['p-h', pg(['s1'])]]);
    const sections = new Map<string, SectionDoc>([['s1', { type: 'weird', state: 'published' }]]);
    const p = validateForPublish(site([], 'p-h'), pages, sections, manifest);
    expect(p.map((x) => x.code)).toEqual(['templateMissing']);
  });
  it('flags a home page that is absent', () => {
    const p = validateForPublish(site([], 'p-h'), new Map(), new Map(), manifest);
    expect(p).toContainEqual({ code: 'homeMissing', pageKey: 'p-h' });
  });
  it('resolves @TID@ in section keys', () => {
    const pages = new Map([['p-a', pg(['x-@TID@'])]]);
    const sections = new Map<string, SectionDoc>([['x-scs', { type: 'weird', state: 'published' }]]);
    expect(validateForPublish(site([page('a', 'a')]), pages, sections, manifest).map((x) => x.code)).toEqual(['templateMissing']);
  });
  it('flags an archived home page outside the tree', () => {
    const p = validateForPublish(site([], 'p-h'), new Map([['p-h', pg([], { isArchived: true })]]), new Map(), manifest);
    expect(p).toEqual([{ code: 'pageArchived', pageKey: 'p-h' }]);
  });
  it('flags a private home page outside the tree', () => {
    const p = validateForPublish(site([], 'p-h'), new Map([['p-h', pg([], { isPrivate: true })]]), new Map(), manifest);
    expect(p).toEqual([{ code: 'pagePrivate', pageKey: 'p-h' }]);
  });
  it('does not double-report a private home page that is in the tree', () => {
    const p = validateForPublish(site([page('a', 'a')], 'p-a'), new Map([['p-a', pg([], { isPrivate: true })]]), new Map(), manifest);
    expect(p).toEqual([{ code: 'pagePrivate', nodeId: 'a' }]);
  });
  it('pins slugDuplicate, pageDuplicate and linkInvalid', () => {
    const pages = new Map([['p-a', pg()], ['p-b', pg()]]);
    const dupSlug = validateForPublish(site([page('a', 'x'), page('b', 'x', 'p-b')]), pages, new Map(), manifest);
    expect(dupSlug).toContainEqual({ code: 'slugDuplicate', nodeId: 'b' });
    const dupPage = validateForPublish(site([page('a', 'a'), page('b', 'b', 'p-a')]), pages, new Map(), manifest);
    expect(dupPage).toContainEqual({ code: 'pageDuplicate', nodeId: 'b' });
    const bad = validateForPublish(site([page('a', 'a'), { id: 'l', type: 'link', label: 'l', url: 'javascript:alert(1)' }]), pages, new Map(), manifest);
    expect(bad).toContainEqual({ code: 'linkInvalid', nodeId: 'l' });
  });
});
