// Run: node --test scripts/la21staefa/import-news.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { germanDate, keyOf, newsArticleOf, unknownTags } from './import-news.mjs';

const entry = {
  slug: '20260216news_entenbetreuer', date: '20260216', tags: ['Oase Kirchbühl'], title: 'Enten gesucht', subTitle: 'Laufenten',
  html: '<p>Text</p>', images: [{ url: 'https://mcusercontent.com/x/images/b0fe.jpg', alt: 'Laufenten' }],
};

test('dates read as German text', () => {
  assert.equal(germanDate('20260216'), '16. Februar 2026');
  assert.equal(germanDate('20261117'), '17. November 2026');
  assert.throws(() => germanDate('2026-02-16'));
});

test('a newsletter entry becomes a public, published article with its group as category', () => {
  const a = newsArticleOf(entry);
  assert.equal(keyOf(entry), 'la21staefa_20260216news_entenbetreuer');
  assert.equal(a.name, '20260216news_entenbetreuer');
  assert.equal(a.type, 'article');
  assert.equal(a.state, 'published');
  assert.equal(a.roleNeeded, 'none');
  assert.equal(a.tags, 'Oase Kirchbühl');
  assert.deepEqual(a.tenants, ['la21staefa']);
  assert.equal(a.properties.datePublished, '20260216');
  assert.equal(a.subTitle, '16. Februar 2026 · Oase Kirchbühl · Laufenten');
  assert.equal(a.properties.images[0].url, 'tenant/la21staefa/section/la21staefa_20260216news_entenbetreuer/b0fe.jpg');
  assert.equal(a.content.position, 4);
});

test('a long subtitle drops its last part instead of exceeding 100 characters', () => {
  const a = newsArticleOf({ ...entry, subTitle: 'x'.repeat(90) });
  assert.equal(a.subTitle, '16. Februar 2026 · Oase Kirchbühl');
});

test('categories must be tags the tenant defines; an entry needs one', () => {
  assert.deepEqual(unknownTags({ tags: ['SMäRT', 'Lokal + fair'] }, ['SMäRT', 'Lokal + Fair']), ['Lokal + fair']);
  assert.throws(() => newsArticleOf({ ...entry, tags: [] }));
});
