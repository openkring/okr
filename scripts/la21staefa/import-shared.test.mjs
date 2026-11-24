// Run: node --test scripts/la21staefa/import-shared.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fileNameOf, imageLayoutOf } from './import-shared.mjs';

test('file names are storage-safe', () => {
  assert.equal(fileNameOf('https://x/wp-content/uploads/2024/06/Bild Stäfa (1).jpg'), 'Bild-Stafa-1-.jpg');
});

test('one picture has no layout of its own, several are a grid or mosaic', () => {
  assert.equal(imageLayoutOf(1), undefined);
  assert.equal(imageLayoutOf(4), 'grid');
  assert.equal(imageLayoutOf(7), 'mosaic');
});
