// Run: node --test scripts/la21staefa/import-pages.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { articleOf, fileNameOf, imageLayoutOf, needsManualWork, targetOf } from './import-pages.mjs';

test('old pages map to group content pages, subpages to their group, verein pages to website pages', () => {
  assert.equal(targetOf('https://www.la21staefa.ch/btvz-start/kreiswerk/'), 'la21staefa_btvzbauteilezur_content');
  assert.equal(targetOf('https://www.la21staefa.ch/qatira/'), 'la21staefa_qatira_content');
  assert.equal(targetOf('https://www.la21staefa.ch/verein/mitmachen/'), 'la21staefa_mitmachen');
  assert.equal(targetOf('https://www.la21staefa.ch/verein/'), 'la21staefa_verein');
  assert.equal(targetOf('https://www.la21staefa.ch/impressum/'), '');
});

test('file names are storage-safe', () => {
  assert.equal(fileNameOf('https://x/wp-content/uploads/2024/06/Bild Stäfa (1).jpg'), 'Bild-Stafa-1-.jpg');
});

test('one picture sits on the right, several as grid or mosaic', () => {
  assert.equal(imageLayoutOf(1), undefined);
  assert.equal(imageLayoutOf(4), 'grid');
  assert.equal(imageLayoutOf(7), 'mosaic');
  const a = articleOf('k', { title: 'T', html: '<p>x</p>', images: [{ url: 'u', alt: 'a' }] }, new Map([['u', 'tenant/x/u.jpg']]));
  assert.equal(a.content.position, 4);
  assert.equal(a.properties.images[0].url, 'tenant/x/u.jpg');
});

test('forms and embeds are reported', () => {
  assert.ok(needsManualWork({ kind: 'form' }));
  assert.ok(!needsManualWork({ kind: 'article', note: '' }));
});

test('a title or subtitle over 100 characters moves into the text', () => {
  const long = 'x'.repeat(120);
  const a = articleOf('k', { title: long, subTitle: long, html: '<p>t</p>' }, new Map());
  assert.equal(a.title, '');
  assert.equal(a.subTitle, '');
  assert.ok(a.content.htmlContent.startsWith(`<h3>${long}</h3><p><strong>${long}</strong></p>`));
});
