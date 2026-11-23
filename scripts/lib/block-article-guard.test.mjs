// Run: node --test scripts/lib/block-article-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoBlocks, assertNoBlocksIn, hasBlocks } from './block-article-guard.mjs';

const article = (properties, type = 'article') => ({ type, title: 'Geheimer Titel', content: { htmlContent: '<p>Geheimer Text</p>' }, properties });
const blocks = [{ id: 'a', type: 'text', html: '<p>Geheimer Text</p>' }];

test('an article with blocks has blocks, also an empty list and without type', () => {
  assert.equal(hasBlocks(article({ blocks })), true);
  assert.equal(hasBlocks(article({ blocks: [] })), true);       // the editor's empty article: the old fields are not read any more
  assert.equal(hasBlocks({ properties: { blocks } }), true);    // articleBlocksOf: type absent counts as an article
});

test('a missing document, an old article and malformed data have no blocks', () => {
  for (const data of [undefined, null, {}, article(undefined), article(null), article({ images: [] }), article({ blocks: undefined }),
    article({ blocks: null }), article({ blocks: 'x' }), article({ blocks: {} }), 'x', 42]) {
    assert.equal(hasBlocks(data), false);
  }
});

test('another section type has no article blocks', () => {
  assert.equal(hasBlocks(article({ blocks }, 'tiles')), false);
});

test('assertNoBlocks throws with the key, and prints no content', () => {
  assert.throws(() => assertNoBlocks('la21staefa_verein_s13', article({ blocks })), (err) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /sections\/la21staefa_verein_s13/);
    assert.doesNotMatch(`${err.message}${JSON.stringify(err)}`, /Geheim/);
    return true;
  });
});

test('assertNoBlocks passes a missing document and an old article', () => {
  assert.doesNotThrow(() => assertNoBlocks('a', undefined));
  assert.doesNotThrow(() => assertNoBlocks('a', article({ images: [] })));
});

/** A Firestore with the given sections; every document read is recorded, and nothing else exists on it. */
function fakeDb(docs) {
  const reads = [];
  return {
    reads,
    doc: (path) => ({ path }),
    getAll: async (...refs) => refs.length === 0 ? assert.fail('getAll() needs a reference') : refs.map(({ path }) => {
      reads.push(path);
      const data = docs[path.replace(/^sections\//, '')];
      return { id: path.split('/').pop(), exists: data !== undefined, data: () => data };
    }),
  };
}

test('assertNoBlocksIn reads every key once and stops with all keys that have blocks', async () => {
  const db = fakeDb({ a: article({ images: [] }), b: article({ blocks }), c: article({ blocks: [] }) });
  await assert.rejects(assertNoBlocksIn(db, ['a', 'b', 'missing', 'c', 'b']), (err) => {
    assert.match(err.message, /sections\/b, sections\/c/);
    assert.doesNotMatch(err.message, /Geheim|sections\/a|missing/);
    return true;
  });
  assert.deepEqual(db.reads, ['sections/a', 'sections/b', 'sections/missing', 'sections/c']);
});

test('assertNoBlocksIn passes old, missing and no sections', async () => {
  const db = fakeDb({ a: article({ images: [] }) });
  await assertNoBlocksIn(db, ['a', 'missing']);
  await assertNoBlocksIn(db, []); // getAll() without references is an error of the SDK
  assert.deepEqual(db.reads, ['sections/a', 'sections/missing']);
});

test('a document that cannot be read stops the script', async () => {
  const db = { doc: (path) => ({ path }), getAll: async () => { throw new Error('unavailable'); } };
  await assert.rejects(assertNoBlocksIn(db, ['a']), /unavailable/);
});
