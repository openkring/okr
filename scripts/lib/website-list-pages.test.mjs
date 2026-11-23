import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LIST_PAGES, planListPages } from './website-list-pages.mjs';

const site = () => ({
  tenants: ['scs'],
  nav: [{ id: 'm-news', type: 'menu', label: 'News', url: '/news', children: [
    { id: 'l-alle', type: 'link', label: 'Alle', labelI18n: { en: 'All' }, url: '/news' },
    { id: 'l-tag', type: 'link', label: 'Regatten', url: '/news?tag=regatta' },
  ] }],
  footer: [{ id: 'f-news', type: 'link', label: 'News', url: '/news' }],
});

test('a link becomes a page entry in place, menu and filtered links stay', () => {
  const s = site();
  const { nav, pages, sections } = planListPages('scs', s);
  assert.deepEqual(nav[0].children[0], { id: 'l-alle', type: 'page', label: 'Alle', labelI18n: { en: 'All' }, pageKey: 'scsw_news', slug: 'news' });
  assert.equal(nav[0].url, '/news');
  assert.equal(nav[0].children[1].type, 'link');
  assert.deepEqual(pages.scsw_news.sections, ['scsw_news_hero']);
  assert.equal(pages.scsw_news.isPrivate, false);
  assert.equal(sections.scsw_news_hero.roleNeeded, 'public');
  assert.equal(s.nav[0].children[0].type, 'link', 'the input is not changed');
});

test('a second run changes nothing', () => {
  const s = site();
  const first = planListPages('scs', s);
  const again = planListPages('scs', { ...s, nav: first.nav });
  assert.deepEqual(again.pages, {});
  assert.deepEqual(again.nav, first.nav);
});

test('without a link there is nothing to convert', () => {
  const { pages, lines } = planListPages('scs', { ...site(), nav: [] });
  assert.deepEqual(pages, {});
  assert.match(lines[0], /skipped/);
});

test('every text fits the form of the app', () => {
  for (const spec of Object.values(LIST_PAGES).flat()) {
    assert.ok(spec.title.length <= 50, `${spec.pageKey} title`);
    assert.ok((spec.abstract ?? '').length <= 500, `${spec.pageKey} abstract`);
    for (const texts of spec.hero ? [spec.hero, spec.hero.en] : []) {
      assert.ok(texts.title.length <= 100, `${spec.pageKey} hero title`);
      assert.ok(texts.subTitle.length <= 100, `${spec.pageKey} hero subTitle`);
    }
  }
});
