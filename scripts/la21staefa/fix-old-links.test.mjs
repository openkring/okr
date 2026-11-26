// Run: node --test scripts/la21staefa/fix-old-links.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rewrite, rewriteDeep } from './fix-old-links.mjs';

const O = 'https://la21staefa-website-54aef.web.app';

test('an old page link points at the new page', () => {
  assert.equal(rewrite('<a href="https://www.la21staefa.ch/btvz-start/kreiswerk/">KreisWERK</a>', O), `<a href="${O}/kreiswerk">KreisWERK</a>`);
  assert.equal(rewrite('<a href="https://www.la21staefa.ch/staefnet/">x</a>', O), `<a href="${O}/stafnet">x</a>`);
});

test('documents on the old site stay, unknown pages are reported', () => {
  const unknown = new Set();
  const pdf = '<a href="https://www.la21staefa.ch/wp-content/uploads/2025/05/a.pdf">a</a>';
  assert.equal(rewrite(pdf, O, unknown), pdf);
  rewrite('<a href="https://www.la21staefa.ch/la21-kommunikation/meldung-veranstaltung/">m</a>', O, unknown);
  assert.deepEqual([...unknown], ['https://www.la21staefa.ch/la21-kommunikation/meldung-veranstaltung/']);
});

test('a dead link loses its anchor, keeps its text; a mail address becomes mailto', () => {
  const dead = '<p><a href="https://www.la21staefa.ch/uploads/files/Merkblatt-FW-engagiert-Kopie.pdf#asset:13806@2:url@1">Merkblatt</a> und</p>';
  assert.equal(rewrite(dead, O), '<p>Merkblatt und</p>');
  assert.equal(rewrite('<a href="https://www.la21staefa.ch/smaert/sodabags@gmx.ch">Mail</a>', O), '<a href="mailto:sodabags@gmx.ch">Mail</a>');
});

test('nested strings are rewritten, other values kept; a second run changes nothing', () => {
  const v = { htmlContent: '<a href="https://www.la21staefa.ch/qatira/">Q</a>', n: 3, blocks: [{ html: '<a href="https://la21staefa.ch/qatira/">Q</a>' }] };
  const once = rewriteDeep(v, O);
  assert.equal(once.blocks[0].html, `<a href="${O}/qatira">Q</a>`);
  assert.equal(once.n, 3);
  assert.deepEqual(rewriteDeep(once, O), once);
});

test('a domain move rewrites links on the previous origin', () => {
  assert.equal(rewrite(`<a href="${O}/qatira">Q</a>`, 'https://www.example.org', new Set(), [O]), '<a href="https://www.example.org/qatira">Q</a>');
});
