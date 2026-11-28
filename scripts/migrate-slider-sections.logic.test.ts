// pnpm exec esbuild scripts/migrate-slider-sections.logic.test.ts --bundle --platform=node --packages=external \
//   --tsconfig=tsconfig.base.json --format=cjs --outfile=dist/scripts/migrate-slider-sections.logic.test.cjs
// node --test dist/scripts/migrate-slider-sections.logic.test.cjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IMAGE_STYLE_SHAPE } from '@okr/shared-models';
import {
  applySkip, buildPlan, entriesOf, isFramed, parsePlan, planSlider, publicDifferences, reportOf, sliderPatch, summaryOf, undoSkip, updateTimeOf, usageFinder,
  type MigrateEntry, type StoredSlider,
} from './migrate-slider-sections.logic';

const img = (url: string): object => ({ label: '', type: 0, url, actionUrl: '', altText: '', overlay: '' });
const slider = (properties: unknown, rest: object = {}): StoredSlider =>
  ({ type: 'slider', name: 'boote', title: 'Unsere Boote', tenants: ['scs'], properties, ...rest }) as StoredSlider;
const UT = { seconds: 10, nanoseconds: 5 };
const T = updateTimeOf(UT);
const migrated = (data: StoredSlider): MigrateEntry => {
  const e = planSlider('k1', data, T);
  assert.equal(e.action, 'migrate', JSON.stringify(e));
  return e as MigrateEntry;
};

test('a slider with images is planned as an article with one gallery block, same public output', () => {
  const e = migrated(slider({ images: [img('a.jpg'), img('b.jpg')], imageStyle: IMAGE_STYLE_SHAPE }));
  assert.equal(e.patch.type, 'article');
  assert.deepEqual(e.patch.properties['images'], []);
  const blocks = e.patch.properties['blocks'] as { type: string; layout: string; images: unknown[] }[];
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'gallery');
  assert.equal(blocks[0].layout, 'slider');
  assert.equal(blocks[0].images.length, 2);
  assert.equal(e.images, 2);
  assert.deepEqual(e.original, { images: [img('a.jpg'), img('b.jpg')], imageStyle: IMAGE_STYLE_SHAPE });
});

test('a slider without images is left out', () => {
  for (const properties of [{ images: [] }, {}, undefined, null]) {
    const e = planSlider('k1', slider(properties), T);
    assert.equal(e.action, 'leave');
    assert.equal(e.action === 'leave' && e.reason, 'no-images');
  }
});

test('isFramed: the default style has a border and a radius; none and 0 do not', () => {
  assert.equal(isFramed(slider({ images: [] })), true);
  assert.equal(isFramed(slider({ images: [], imageStyle: { border: 'none', borderRadius: '0' } })), false);
  assert.equal(isFramed(slider({ images: [], imageStyle: { border: '', borderRadius: '12px' } })), true);
});

test('applySkip: only an unchanged slider of the tenant is written', () => {
  const data = slider({ images: [img('a.jpg')] });
  const e = migrated(data);
  assert.equal(applySkip(e, { section: data, updateTime: T }, 'scs'), undefined);
  assert.equal(applySkip(e, undefined, 'scs'), 'missing');
  assert.equal(applySkip(e, { section: data, updateTime: T }, 'p13'), 'other-tenant');
  assert.equal(applySkip(e, { section: { ...data, ...e.patch } as StoredSlider, updateTime: T }, 'scs'), 'not-a-slider');
  assert.equal(applySkip(e, { section: data, updateTime: '11.000000000' }, 'scs'), 'changed-since-trial');
  assert.equal(applySkip(e, { section: slider({ images: [img('b.jpg')] }), updateTime: T }, 'scs'), 'patch-differs');
});

test('undoSkip: only an unedited migrated article goes back', () => {
  const data = slider({ images: [img('a.jpg')] });
  const e = migrated(data);
  const article = { ...data, ...e.patch } as StoredSlider;
  assert.equal(undoSkip(e, article, 'scs'), undefined);
  assert.equal(undoSkip(e, undefined, 'scs'), 'missing');
  assert.equal(undoSkip(e, article, 'p13'), 'other-tenant');
  assert.equal(undoSkip(e, data, 'scs'), 'not-migrated');
  assert.equal(undoSkip(e, { ...article, properties: { images: [], blocks: [] } } as StoredSlider, 'scs'), 'edited');
});

test('plan round trip, entries per tenant, shared slider in both', () => {
  const plan = buildPlan([
    ['b', slider({ images: [img('a.jpg')] }, { tenants: ['scs', 'kring'] }), UT],
    ['a', slider({ images: [] }), UT],
  ], '2026-11-28T00:00:00Z', 'p');
  assert.deepEqual(plan.entries.map((e) => e.key), ['a', 'b']);
  const parsed = parsePlan(JSON.stringify(plan), 'p');
  assert.deepEqual(entriesOf(parsed, 'scs').map((e) => e.key), ['b']);
  assert.deepEqual(entriesOf(parsed, 'kring').map((e) => e.key), ['b']);
  assert.throws(() => parsePlan(JSON.stringify(plan), 'q'), /project/);
  assert.throws(() => parsePlan(JSON.stringify({ ...plan, kind: 'article-blocks' }), 'p'), /not a plan/);
  const broken = { ...plan, entries: [{ ...plan.entries[1], patch: { type: 'article', properties: { blocks: [] } } }] };
  assert.throws(() => parsePlan(JSON.stringify(broken), 'p'), /patch/);
});

test('reports hold key, name and title only, never image urls', () => {
  const plan = buildPlan([['b', slider({ images: [img('geheim.jpg')] }), UT]], '2026-11-28T00:00:00Z', 'p');
  for (const report of [reportOf(plan, 'scs'), summaryOf(plan)]) assert.ok(!report.includes('geheim'), report);
  assert.match(reportOf(plan, 'scs'), /`b` · boote · Unsere Boote — 1 images, border or radius/);
});

test('publicDifferences: two images on a website are drawn the same; one is hidden today and shown afterwards', () => {
  const two = slider({ images: [img('a.jpg'), img('b.jpg')] });
  assert.deepEqual(publicDifferences('k', two, { ...two, ...sliderPatch(two) } as StoredSlider, { website: true, accordion: false, news: false }), []);
  const one = slider({ images: [img('a.jpg')] });
  assert.notDeepEqual(publicDifferences('k', one, { ...one, ...sliderPatch(one) } as StoredSlider, { website: true, accordion: false, news: false }), []);
  assert.ok(publicDifferences('k', two, { ...two, ...sliderPatch(two) } as StoredSlider, { website: false, accordion: true, news: false }).length > 0);
});

test('usageFinder: website pages, news pages and accordions, with @TID@ resolved; archived ones do not count', () => {
  const usage = usageFinder(
    [{ key: 'home', sections: ['s1', 's@TID@'], tenants: ['scs'] }, { key: 'news_scs', sections: ['s3'] }, { key: 'old', sections: ['s4'], isArchived: true }],
    [{ nav: [{ type: 'menu', children: [{ type: 'page', pageKey: 'home' }, { type: 'page', pageKey: 'old' }] }] }],
    [{ properties: { items: [{ key: 's5' }] } }, { properties: { items: [{ key: 's6' }] }, isArchived: true }],
  );
  assert.deepEqual(usage('s1'), { website: true, accordion: false, news: false });
  assert.equal(usage('sscs').website, true);
  assert.deepEqual(usage('s3'), { website: false, accordion: false, news: true });
  assert.equal(usage('s4').website, false);
  assert.deepEqual(usage('s5'), { website: false, accordion: true, news: false });
  assert.equal(usage('s6').accordion, false);
});
