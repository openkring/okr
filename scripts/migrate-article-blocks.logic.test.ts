// pnpm exec esbuild scripts/migrate-article-blocks.logic.test.ts --bundle --platform=node --packages=external \
//   --tsconfig=tsconfig.base.json --format=cjs --outfile=dist/scripts/migrate-article-blocks.logic.test.cjs
// node --test dist/scripts/migrate-article-blocks.logic.test.cjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PLAN_VERSION, buildPlan, entriesOf, parseArgs, parsePlan, planDocument, publicDifferences, reportOf, summaryOf, tenantsOf, updateTimeOf,
  type MigrateEntry, type PlanEntry, type StoredSection,
} from './migrate-article-blocks.logic';

const img = (url: string, more: object = {}): object => ({ label: '', type: 0, url, actionUrl: '', altText: '', overlay: '', ...more });
const doc = (position: number, properties: object, rest: object = {}): StoredSection =>
  ({ type: 'article', name: 'n1', title: 'T1', tenants: ['scs'], content: { htmlContent: '<p>GEHEIM</p>', position }, properties, ...rest });
const UT = { seconds: 10, nanoseconds: 5 };
const plan = (id: string, data: StoredSection): PlanEntry => planDocument(id, data, updateTimeOf(UT));

// ------------------------------------------------- arguments ------------------------------------------------

test('parseArgs: trial needs a directory', () => {
  assert.deepEqual(parseArgs(['--out=x']), { mode: 'trial', out: 'x' });
  assert.throws(() => parseArgs([]), /--out/);
});
test('parseArgs: apply and undo need a tenant and a plan', () => {
  assert.deepEqual(parseArgs(['--apply', '--tenant=scs', '--plan=p.json']), { mode: 'apply', tenant: 'scs', plan: 'p.json' });
  assert.deepEqual(parseArgs(['--undo', '--plan=p.json', '--tenant=scs']), { mode: 'undo', tenant: 'scs', plan: 'p.json' });
  for (const mode of ['--apply', '--undo']) {
    for (const rest of [[], ['--tenant=scs'], ['--plan=p'], ['--tenant=', '--plan=p'], ['--tenant=scs', '--plan=']]) {
      assert.throws(() => parseArgs([mode, ...rest]), /--tenant=<id> and --plan=<file>/);
    }
  }
});
test('parseArgs: refuses both modes, unknown and misplaced arguments', () => {
  assert.throws(() => parseArgs(['--apply', '--undo', '--tenant=scs', '--plan=p']), /one of/);
  for (const bad of ['--force-undo', '--tenant', 'scs', '--apply=true']) assert.throws(() => parseArgs(['--undo', '--tenant=scs', '--plan=p', bad]), /unknown/);
  assert.throws(() => parseArgs(['--out=x', '--tenant=scs']), /only with/);
  assert.throws(() => parseArgs(['--out=x', '--plan=p']), /only with/);
  assert.throws(() => parseArgs(['--apply', '--tenant=scs', '--plan=p', '--out=x']), /only in a trial run/);
  assert.throws(() => parseArgs(['--apply', '--tenant=scs', '--tenant=p13', '--plan=p']), /twice/);
});

// ------------------------------------------------- planning ------------------------------------------------

test('updateTimeOf keeps the nanoseconds', () => {
  assert.equal(updateTimeOf({ seconds: 1795000000, nanoseconds: 123000 }), '1795000000.000123000');
});

test('planDocument: migrate, with everything the report needs', () => {
  const e = plan('k1', doc(0, { images: [img('tenant/a.jpg')] }, { tenants: ['scs', 'p13'] })) as MigrateEntry;
  assert.equal(e.action, 'migrate');
  assert.equal(e.shape, 'cover');
  assert.deepEqual([e.key, e.name, e.title, e.tenants, e.shared, e.updateTime], ['k1', 'n1', 'T1', ['scs', 'p13'], true, '10.000000005']);
  assert.equal(e.patch.blocks.length, 1);
  assert.equal(e.germanDiffers, false);
});

test('planDocument: leave with a reason and the differing fields, never their values', () => {
  const slideshow = { effect: 'fade', autoplay: true, interval: 3, duration: 1 };
  const e = plan('k', doc(3, { images: [img('tenant/a.jpg')], slideshow }));
  assert.deepEqual(e.action === 'leave' && [e.reason, e.detail], ['not-identical', 'slideshow']);
  const url = plan('k', doc(1, { images: [img('')] }));
  assert.deepEqual(url.action === 'leave' && [url.reason, url.detail], ['not-identical', 'image without url: 1 of 1, position 1']);
  const some = plan('k', doc(0, { images: [img('a'), img(' ')] }));
  assert.equal(some.action === 'leave' && some.detail, 'image without url: 1 of 2, position 0');
  const size = plan('k', { ...doc(3, { images: [img('a')] }), content: { htmlContent: 'x', position: 3, colSize: 12 } });
  assert.deepEqual(size.action === 'leave' && size.detail, 'colSize');
  const cover = plan('k', doc(1, { images: [img('a')], cover: img('b') }));
  assert.deepEqual(cover.action === 'leave' && cover.detail, 'cover without blocks');
  const bad = plan('k', doc(1, { images: 'x' }));
  assert.equal(bad.action === 'leave' && bad.detail, 'malformed data');
  for (const [reason, data] of [['journal', doc(1, {}, { journalKey: 'j' })], ['has-blocks', doc(1, { blocks: [] })], ['legacy-image-field', doc(1, { image: img('a') })]] as const) {
    const entry = plan('k', data);
    assert.deepEqual(entry.action === 'leave' && [entry.reason, entry.detail], [reason, '']);
  }
});

test('planDocument: survives a document without anything', () => {
  const e = plan('k', { type: 'article' });
  assert.deepEqual([e.action, e.name, e.title, e.tenants, e.shared], ['migrate', '', '', [], false]);
});

test('germanDiffers: a German translation that is not the text', () => {
  const differs = (contentI18n: unknown): boolean => plan('k', doc(0, { contentI18n })).germanDiffers;
  assert.equal(differs({ de: '<p>anders</p>' }), true);
  assert.equal(differs({ de: '<p>GEHEIM</p>', en: 'x' }), false);
  assert.equal(differs({ en: 'x' }), false);
  assert.equal(differs(undefined), false);
  assert.equal(differs('x'), false);
});

// ------------------------------------------------- comparison of the public output ------------------------------------------------

test('publicDifferences: none for a migrated article of any shape', () => {
  for (const position of [0, 1, 2, 3, 4]) {
    for (const n of [0, 1, 2]) {
      const properties = {
        images: ['a', 'b'].slice(0, n).map((x) => img(`tenant/${x}.jpg`, { altText: x, overlay: `Bild ${x}` })),
        imageStyle: { captionPosition: 'bottom', height: '300px' }, cta: { label: 'Los', url: '/los.html', style: 'primary' },
        contentI18n: { en: '<p>y</p>', rm: '<p>z</p>' }, titleI18n: { en: 'T' }, excerptI18n: { de: 'Auszug' }, datePublished: '20261123',
      };
      const s = doc(position, properties);
      const e = plan('k', s);
      assert.equal(e.action, 'migrate');
      assert.deepEqual(publicDifferences('k', s, { ...s, properties: { ...s.properties, ...(e as MigrateEntry).patch } }), []);
    }
  }
});

test('publicDifferences: names the place and the differing keys', () => {
  const s = doc(1, { images: [img('tenant/a.jpg')], contentI18n: { en: 'E' } });
  const other = { ...s, properties: { images: [img('tenant/b.jpg')], contentI18n: { en: 'E2' } } };
  const found = publicDifferences('k', s, other);
  assert.ok(found.includes('website de: images'), found.join());
  assert.ok(found.includes('website en: content, images'), found.join());
  assert.ok(found.includes('news: content, coverImage, excerpt, images'), found.join());
  assert.ok(found.some((f) => f.startsWith('accordion en')), found.join());
});

test('publicDifferences: a text article that gets an image is another home row', () => {
  const found = publicDifferences('k', doc(0, {}), doc(1, { images: [img('tenant/a.jpg')] }));
  assert.ok(found.includes('home layout'), found.join());
});

test('publicDifferences: unused values do not count, an error does', () => {
  const s = doc(1, { images: [], imageStyle: { height: '300px' } });
  assert.deepEqual(publicDifferences('k', s, { ...s, content: { ...s.content, colSize: 9 }, properties: { images: [] } }), []);
  const broken = doc(1, { images: 'x' });
  assert.ok(publicDifferences('k', broken, broken).every((f) => /error$/.test(f)));
  assert.notDeepEqual(publicDifferences('k', broken, broken), []);
});

// ------------------------------------------------- plan and reports ------------------------------------------------

const docs: [string, StoredSection, typeof UT][] = [
  ['b', doc(1, { images: [img('tenant/a.jpg')] }, { tenants: ['scs', 'p13'] }), UT],
  ['a', doc(0, { images: [img('tenant/a.jpg')], contentI18n: { de: 'anders' } }, { name: '', title: 'Ein *Titel* | mit\n`Zeichen` <b>' }), UT],
  ['c', doc(0, {}, { journalKey: 'j', tenants: ['p13'] }), UT],
  ['d', doc(0, {}, { tenants: [] }), UT],
];
const built = buildPlan(docs, '2026-11-23T10:00:00Z', 'proj');

test('buildPlan and parsePlan', () => {
  assert.deepEqual(built.entries.map((e) => e.key), ['a', 'b', 'c', 'd']);
  assert.deepEqual([built.version, built.projectId], [PLAN_VERSION, 'proj']);
  assert.deepEqual(parsePlan(JSON.stringify(built), 'proj'), built);
  assert.throws(() => parsePlan(JSON.stringify(built), 'other'), /project/);
  assert.throws(() => parsePlan(JSON.stringify({ ...built, version: 0 }), 'proj'), /not a plan/);
  for (const bad of ['{}', 'null', '[]', 'x']) assert.throws(() => parsePlan(bad, 'proj'), /not a plan/);
});

test('entriesOf: the migratable articles of a tenant, shared ones included', () => {
  assert.deepEqual(entriesOf(built, 'scs').map((e) => e.key), ['a', 'b']);
  assert.deepEqual(entriesOf(built, 'p13').map((e) => e.key), ['b']);
  assert.deepEqual(entriesOf(built, 'nope'), []);
  assert.deepEqual(tenantsOf(built), ['(none)', 'p13', 'scs']);
});

test('reportOf: counts, leave-outs, hidden images, differing German text, shared ones; no contents', () => {
  const scs = reportOf(built, 'scs');
  assert.match(scs, /\| cover \| 1 \|/);
  assert.match(scs, /\| image-top \| 1 \|/);
  assert.match(scs, /2 articles, 2 to migrate, 0 left out, 1 shared/);
  assert.match(scs, /## Hidden images that become the cover \(1\)\n\n- `a`/);
  assert.match(scs, /## German translation differs from the German text \(1\)\n\n- `a`/);
  assert.match(scs, /## Shared with other tenants \(1\)\n\n- `b` · n1 · T1 \(p13, scs\)/);
  assert.match(reportOf(built, 'p13'), /## Left out \(1\)\n\n- `c` · n1 · T1 — journal/);
  assert.match(reportOf(built, '(none)'), /1 articles/);
  for (const t of tenantsOf(built)) assert.doesNotMatch(reportOf(built, t), /GEHEIM|anders|a\.jpg|\n\n\n/);
});

test('reportOf: a title cannot break the Markdown', () => {
  const line = reportOf(built, 'scs').split('\n').find((l) => l.startsWith('- `a`'));
  assert.equal(line, '- `a` · (no name) · Ein \\*Titel\\* \\| mit \\`Zeichen\\` \\<b\\>');
});

test('summaryOf: totals count a shared article once', () => {
  const s = summaryOf(built);
  assert.match(s, /4 articles, 3 to migrate, 1 left out, 1 shared/);
  assert.match(s, /\| cover \| 1 \|/);
  assert.match(s, /\| journal \| 1 \|/);
  assert.match(s, /\| p13 \| 2 \| 1 \| 1 \| 1 \|/);
});
