// Run: node --test scripts/la21staefa/import-wp-documents.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { docKeyOf, documentOf, downloadUrl, parseWpUrl, rewriteDeep, titleOf } from './import-wp-documents.mjs';

const OLD = 'https://www.la21staefa.ch/wp-content/uploads/2025/03/Jahresbericht-2024-Bau-Energie.pdf';

test('an old file link is parsed into year, month and file', () => {
  assert.deepEqual(parseWpUrl(OLD), { year: '2025', month: '03', file: 'Jahresbericht-2024-Bau-Energie.pdf', rel: '2025/03/Jahresbericht-2024-Bau-Energie.pdf' });
  assert.equal(parseWpUrl('https://www.la21staefa.ch/qatira/'), undefined);
});

test('title, key and download url', () => {
  assert.equal(titleOf('Oase-Kirchbuehl-Jahresbericht_2023.pdf'), 'Oase Kirchbuehl Jahresbericht 2023');
  assert.equal(docKeyOf('Leistungsvereinbarung-mit-Ref.-Kirche-2023.11.09.pdf'), 'la21staefa_wp_leistungsvereinbarung-mit-ref-kirche-2023-11-09');
  assert.equal(downloadUrl('tenant/la21staefa/document/a b.pdf', 't1'),
    'https://firebasestorage.googleapis.com/v0/b/bkaiser-org.appspot.com/o/tenant%2Fla21staefa%2Fdocument%2Fa%20b.pdf?alt=media&token=t1');
});

test('the document carries the old upload month and lands in the website folder', () => {
  const d = documentOf({ file: 'x.pdf', year: '2024', month: '03', path: 'p', url: 'u', size: 9, hash: 'h', mimeType: 'application/pdf' });
  assert.equal(d.dateOfDocCreation, '20240301');
  assert.deepEqual(d.folderKeys, ['la21staefa_website']);
  assert.equal(d.index, 'n:x h:h m:application/pdf f:la21staefa_website');
});

test('only moved files are rewritten, in every nested string', () => {
  const urls = new Map([['2025/03/Jahresbericht-2024-Bau-Energie.pdf', 'NEW']]);
  const other = 'https://www.la21staefa.ch/wp-content/uploads/2024/10/E-Mail-Liste-2.pdf';
  const v = { html: `<a href="${OLD}">a</a> <a href="${other}">b</a>`, blocks: [{ t: OLD }], n: 1 };
  assert.deepEqual(rewriteDeep(v, urls), { html: `<a href="NEW">a</a> <a href="${other}">b</a>`, blocks: [{ t: 'NEW' }], n: 1 });
});
