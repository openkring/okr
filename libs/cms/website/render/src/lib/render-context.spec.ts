import type { WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { navItems } from './render-context';

const site = { homePageKey: 'scsw_home' } as unknown as WebsiteModel;
const menu = (id: string, extra: Partial<WebsiteNode> = {}): WebsiteNode =>
  ({ id, type: 'menu', label: id, children: [{ id: `${id}-p`, type: 'page', label: 'p', slug: `${id}-p`, pageKey: `k-${id}` }], ...extra });

describe('navItems', () => {
  it('gives a menu with its own link that url, in the render language', () => {
    const [de] = navItems([menu('m', { url: '/termine' })], site, 'de', '');
    const [en] = navItems([menu('m', { url: ' /termine ' })], site, 'en', '');
    expect(de.url).toBe('/termine');
    expect(en.url).toBe('/en/termine');
    expect(en.children[0].url).toBe('/en/m-p');
  });

  it('leaves a menu without a link, with an empty one or with an unsafe one without url', () => {
    for (const url of [undefined, '', '   ', 'javascript:alert(1)', '//evil.com']) {
      expect(navItems([menu('m', { url })], site, 'de', '')[0].url).toBe('');
    }
  });
});
