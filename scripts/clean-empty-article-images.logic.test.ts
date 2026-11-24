// pnpm exec esbuild scripts/clean-empty-article-images.logic.test.ts --bundle --platform=node --packages=external \
//   --tsconfig=tsconfig.base.json --format=cjs --outfile=dist/scripts/clean-empty-article-images.logic.test.cjs
// node --test dist/scripts/clean-empty-article-images.logic.test.cjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCleanable, isEmptyImage, withoutImages } from './clean-empty-article-images.logic';
import type { StoredSection } from './migrate-article-blocks.logic';

const empty = { label: '', type: 0, url: '', actionUrl: '', altText: '', overlay: '' };
const doc = (properties: object, rest: object = {}): StoredSection =>
  ({ type: 'article', name: 'n', title: 'T', tenants: ['scs'], content: { htmlContent: '<p>Text</p>', position: 1 }, properties, ...rest });

test('only an image without any content is empty', () => {
  assert.ok(isEmptyImage(empty));
  assert.ok(isEmptyImage({ url: '  ' }));
  for (const image of [{ ...empty, url: 'a.jpg' }, { ...empty, altText: 'x' }, { ...empty, label: 'x' }, null, 'a', []]) assert.equal(isEmptyImage(image), false);
});

test('an article with one empty image is cleaned, at any position', () => {
  for (const position of [0, 1, 4]) assert.ok(isCleanable('k', doc({ images: [empty] }, { content: { htmlContent: '<p>Text</p>', position } })));
});

test('an article with a real image, with no image, with blocks or of a journal is not touched', () => {
  assert.equal(isCleanable('k', doc({ images: [empty, { ...empty, url: 'a.jpg' }] })), false);
  assert.equal(isCleanable('k', doc({ images: [] })), false);
  assert.equal(isCleanable('k', doc({})), false);
  assert.equal(isCleanable('k', doc({ images: [empty], blocks: [] })), false);
  assert.equal(isCleanable('k', doc({ images: [empty] }, { journalKey: 'j' })), false);
  assert.equal(isCleanable('k', doc({ images: [empty] }, { type: 'gallery' })), false);
});

test('cleaning changes the images only', () => {
  const before = doc({ images: [empty], imageStyle: { width: '100%' } });
  const after = withoutImages(before);
  assert.deepEqual(after, { ...before, properties: { images: [], imageStyle: { width: '100%' } } });
  assert.equal(isCleanable('k', after), false);
});
