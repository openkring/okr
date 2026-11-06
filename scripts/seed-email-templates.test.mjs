import { test } from 'node:test';
import assert from 'node:assert/strict';

import { docForOkey, fillLayout, nextVersion, parseArgs, templateDocs } from './seed-email-templates.logic.mjs';

// Made-up values: the public repo names no tenant.
const ROW = {
  tenant: 'acme',
  logoUrl: 'https://img.example.test/tenant/acme/logo/email-header.png',
  logoAlt: 'Logo von Acme',
  logoWidth: 180,
  headerLink: 'https://www.acme.example',
  footerName: 'Acme AG',
};
const NOW = '20261106';

test('fillLayout leaves Handlebars alone and fills every placeholder', () => {
  const source = '<a href="%%HEADER_LINK%%"><img src="%%LOGO_URL%%" alt="%%LOGO_ALT%%" width="%%LOGO_WIDTH%%"></a>\n{{{content}}} {{#if contact_email}}{{contact_email}}{{/if}} © {{year}} %%FOOTER_NAME%%';
  const out = fillLayout(source, ROW);
  assert.ok(!out.includes('%%'));
  assert.ok(out.includes('href="https://www.acme.example"'));
  assert.ok(out.includes('width="180"'));
  assert.ok(out.includes('© {{year}} Acme AG'));
  assert.ok(out.includes('{{{content}}} {{#if contact_email}}{{contact_email}}{{/if}}'));
});

test('fillLayout does not read "$&" in a value as a replacement pattern', () => {
  assert.equal(fillLayout('%%FOOTER_NAME%%', { ...ROW, footerName: 'A $& B' }), 'A $& B');
});

test('fillLayout throws on a row with a missing value', () => {
  assert.throws(() => fillLayout('%%LOGO_URL%% %%FOOTER_NAME%%', { ...ROW, logoUrl: '' }), /LOGO_URL/);
  assert.throws(() => fillLayout('%%HEADER_LINK%%', { ...ROW, headerLink: undefined }), /HEADER_LINK/);
});

test('fillLayout throws on a placeholder it does not know and on a value that opens Handlebars', () => {
  assert.throws(() => fillLayout('%%SOMETHING_ELSE%%', ROW), /SOMETHING_ELSE/);
  assert.throws(() => fillLayout('%%FOOTER_NAME%%', { ...ROW, footerName: '{{content}}' }), /FOOTER_NAME/);
});

test('templateDocs writes system docs for the shared templates', () => {
  const docs = templateDocs(undefined, { now: NOW });
  assert.deepEqual(docs.map((d) => d.okey), ['email-layout-plain', 'email-text-password-reset']);
  for (const d of docs) {
    assert.deepEqual(d.template.tenants, ['system']);
    assert.equal(d.template.status, 'published');
    assert.equal(d.template.currentVersion, 1);
    assert.equal(d.template.isArchived, false);
    assert.equal(d.template.category, 'other');
    assert.equal(d.template.language, 'de');
    assert.equal(d.template.createdBy, 'seed');
    assert.equal(d.template.createdAt, NOW);
    assert.equal('draftVersion' in d.template, false);
    assert.equal(d.versionId, '1');
    assert.equal(d.version.status, 'published');
    assert.equal(d.version.publishedBy, 'seed');
    assert.deepEqual(d.version.partials, {});
    assert.deepEqual(d.version.assets, []);
    assert.equal(d.version.css, '');
  }
  const [plain, reset] = docs;
  assert.equal(plain.template.kind, 'emailLayout');
  assert.equal(reset.template.kind, 'emailText');
  assert.ok(reset.version.subject.includes('{{app_name}}'));
  assert.ok(reset.version.html.includes('{{{url}}}'));
  assert.ok(reset.version.text.includes('{{{url}}}'));
  assert.deepEqual(Object.keys(JSON.parse(reset.template.sampleData)).sort(), ['app_name', 'email', 'login_id', 'url']);
});

test('templateDocs writes tenants [id] and okey email-layout_<id> for a layout', () => {
  const docs = templateDocs(ROW, { now: NOW });
  assert.equal(docs.length, 1);
  const [d] = docs;
  assert.equal(d.okey, 'email-layout_acme');
  assert.deepEqual(d.template.tenants, ['acme']);
  assert.equal(d.template.kind, 'emailLayout');
  assert.ok(d.version.html.includes('src="https://img.example.test/tenant/acme/logo/email-header.png"'));
  assert.ok(d.version.html.includes('© {{year}} Acme AG'));
  assert.ok(d.version.html.includes('{{{content}}}'));
  assert.ok(d.version.text.includes('{{{content}}}'));
  assert.ok(!d.version.html.includes('%%') && !d.version.text.includes('%%'));
  assert.equal(d.version.subject, '');
});

test('the search index follows getTemplateIndex: n:<name> c:<category> l:<language>', () => {
  const [d] = templateDocs(ROW, { now: NOW });
  assert.equal(d.template.index, `n:${d.template.name} c:other l:de`);
});

test('nextVersion is one above the current version', () => {
  assert.equal(nextVersion({ currentVersion: 1 }), 2);
  assert.equal(nextVersion({ currentVersion: 7 }), 8);
  assert.equal(nextVersion({}), 1);
});

test('docForOkey derives the layout row from the okey and finds shared and tenant-copy docs', () => {
  const rows = { acme: ROW };
  assert.equal(docForOkey('email-layout_acme', rows, { now: NOW }).template.tenants[0], 'acme');
  assert.deepEqual(docForOkey('email-layout-plain', rows, { now: NOW }).template.tenants, ['system']);
  assert.deepEqual(docForOkey('email-layout-plain_acme', rows, { now: NOW }).template.tenants, ['acme']);
  assert.deepEqual(docForOkey('email-text-password-reset_acme', rows, { now: NOW }).template.tenants, ['acme']);
  assert.throws(() => docForOkey('email-layout_nobody', rows, { now: NOW }), /nobody/);
  assert.throws(() => docForOkey('email-layout', rows, { now: NOW }), /email-layout/);
  assert.throws(() => docForOkey('something-else', rows, { now: NOW }), /something-else/);
});

test('parseArgs: dry run by default, needs a target, --update takes an okey', () => {
  assert.deepEqual(parseArgs(['--tenant', 'acme', '--shared']), { apply: false, tenant: 'acme', shared: true, update: undefined });
  assert.equal(parseArgs(['--tenant', 'acme', '--apply']).apply, true);
  assert.equal(parseArgs(['--update', 'email-layout_acme']).update, 'email-layout_acme');
  assert.match(parseArgs([]).error, /Usage/);
  assert.match(parseArgs(['--tenant']).error, /--tenant/);
  assert.match(parseArgs(['--update']).error, /--update/);
  assert.match(parseArgs(['--bogus']).error, /--bogus/);
  assert.match(parseArgs(['--update', 'x', '--shared']).error, /alone/);
});
