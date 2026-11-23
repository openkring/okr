import { describe, expect, it } from 'vitest';
import { drawnArticle, isFreeArticle, withClassicFields, type ArticleLike } from './article-blocks.util';
import {
  articleApplySkip, articleUndoSkip, planArticleMigration, withMigrationPatch, type ArticleMigrationPatch, type MigratableSection,
} from './article-migration.util';
import { ImageType } from './enums/image-type.enum';
import { ViewPosition as VP } from './enums/view-position.enum';
import type { ImageConfig } from './image.model';
import { IMAGE_STYLE_SHAPE } from './image.shapes';
import type { ArticleSlideshow, SectionCta } from './section.model';

const img = (url: string): ImageConfig => ({ label: url, type: ImageType.Image, url, actionUrl: '', altText: '', overlay: '' });
const cta: SectionCta = { label: 'Mehr', url: '/mehr', style: 'primary' };
const show: ArticleSlideshow = { effect: 'fade', autoplay: true, interval: 3, duration: 1 };
const art = (content: ArticleLike['content'], properties?: object, rest: object = {}): MigratableSection =>
  ({ type: 'article', tenants: ['scs'], content: { htmlContent: '<p>Hi</p>', ...content }, ...(properties ? { properties } : {}), ...rest });

function patchOf(s: MigratableSection): ArticleMigrationPatch {
  const plan = planArticleMigration(s);
  if (plan.action !== 'migrate') throw new Error(plan.reason);
  return plan.patch;
}
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type Case = [name: string, shape: string, content: ArticleLike['content'], properties?: object];
const SHAPES: Case[] = [
  ['no image', 'text', { position: VP.None, colSize: 6 }, { images: [] }],
  ['nothing stored', 'text', {}],
  ['no image, full style', 'text', { position: VP.Top }, { images: [], imageStyle: IMAGE_STYLE_SHAPE }],
  ['contentI18n without images', 'text', {}, { contentI18n: { en: '<p>Hello</p>' } }],
  ['one image Top', 'image-top', { position: VP.Top }, { images: [img('a')], imageStyle: { captionPosition: 'bottom' } }],
  ['one image Bottom', 'image-bottom', { position: VP.Bottom }, { images: [img('a')] }],
  ['one image Left', 'image-left', { position: VP.Left, colSize: 4 }, { images: [img('a')] }],
  ['one image Left, colSize absent', 'image-left', { position: VP.Left }, { images: [img('a')] }],
  ['one image Left, a layout that stops the slideshow', 'image-left', { position: VP.Left }, { images: [img('a')], imageLayout: 'mosaic', slideshow: show }],
  ['one image Right', 'image-right', { position: VP.Right, colSize: 11 }, { images: [img('a')] }],
  ['one image None', 'cover', { position: VP.None }, { images: [img('a')], imageStyle: IMAGE_STYLE_SHAPE }],
  ['one image, position absent', 'cover', {}, { images: [img('a')], slideshow: show }],
  ['2 images without layout, Bottom', 'gallery-top', { position: VP.Bottom }, { images: [img('a'), img('b')] }],
  ['3 images mosaic Top', 'gallery-top', { position: VP.Top }, { images: [img('a'), img('b'), img('c')], imageLayout: 'mosaic' }],
  ['one image side-by-side, position absent', 'gallery-top', {}, { images: [img('a')], imageLayout: 'side-by-side' }],
  ['one image with slideshow Top', 'gallery-top', { position: VP.Top }, { images: [img('a')], slideshow: show }],
  ['3 images with slideshow', 'gallery-top', { position: VP.Top }, { images: [img('a'), img('b'), img('c')], slideshow: show }],
  ['2 images pair Bottom', 'gallery-bottom', { position: VP.Bottom }, { images: [img('a'), img('b')], imageLayout: 'pair' }],
  ['one image with slideshow Bottom', 'gallery-bottom', { position: VP.Bottom }, { images: [img('a')], slideshow: show }],
];

describe('planArticleMigration: migrate', () => {
  it.each(SHAPES.flatMap((c): Case[] => [c, [`${c[0]}, with a button`, c[1], c[2], { ...c[3], cta }]]))('%s → %s', (_name, shape, content, properties) => {
    const s = art(content, properties);
    const plan = planArticleMigration(s);
    expect(plan).toMatchObject({ action: 'migrate', shape });
    // the document as the script leaves it, old fields next to the blocks, is drawn the same
    const migrated = withMigrationPatch(s, patchOf(s));
    expect(isFreeArticle(migrated)).toBe(false);
    expect(drawnArticle(withClassicFields(migrated))).toEqual(drawnArticle(s));
  });

  it('the patch holds the blocks, and a cover only for a hidden image', () => {
    expect(patchOf(art({ position: VP.None }, { images: [img('a')] }))).toEqual({
      blocks: [{ id: 'classic-text', type: 'text', html: '<p>Hi</p>' }], cover: img('a'),
    });
    expect(Object.keys(patchOf(art({ position: VP.Top }, { images: [img('a')] })))).toEqual(['blocks']);
  });

  it('an archived article is migrated like any other', () => {
    expect(planArticleMigration(art({}, {}, { isArchived: true }))).toMatchObject({ action: 'migrate', shape: 'text' });
  });

  it('can be stored: no undefined at any depth, no array inside an array, the same after JSON', () => {
    const s = art({ position: VP.Left }, {
      images: [{ ...img('a'), altText: undefined }], imageStyle: { width: undefined, height: '10px' }, contentI18n: { en: 'x', fr: undefined }, cta: { ...cta, labelI18n: undefined },
    });
    const patch = patchOf(s);
    expect(json(patch)).toStrictEqual(patch);
    expect(JSON.stringify(patch)).not.toContain('[[');
    expect(withClassicFields(withMigrationPatch(s, patch)).properties).toMatchObject({ imageStyle: { height: '10px' } });
  });
});

describe('planArticleMigration: leave', () => {
  it.each<[string, string, MigratableSection]>([
    ['one image Left with an active slideshow', 'not-identical', art({ position: VP.Left, colSize: 4 }, { images: [img('a')], slideshow: show })],
    ['one image Left with colSize 12', 'not-identical', art({ position: VP.Left, colSize: 12 }, { images: [img('a')] })],
    ['an image without a url', 'not-identical', art({ position: VP.Top }, { images: [img('a'), img('')] })],
    ['malformed images', 'not-identical', art({}, { images: 'x' })],
    ['a cover without blocks: it would become the picture of the teasers', 'not-identical', art({ position: VP.Top }, { images: [img('a')], cover: img('z') })],
    ['a value that JSON cannot keep', 'not-identical', art({ position: VP.Top }, { images: [{ ...img('a'), taken: new Date(0) }] })],
    ['a number that JSON cannot keep', 'not-identical', art({ position: VP.Top }, { images: [img('a')], imageStyle: { zoom: NaN } })],
    ['an array inside an array', 'not-identical', art({ position: VP.Top }, { images: [{ ...img('a'), focus: [[1, 2]] }] })],
    ['another section', 'not-identical', { type: 'hero', content: { htmlContent: 'T' } }],
    ['a journal article', 'journal', art({}, { images: [] }, { journalKey: 'j1' })],
    ['a journal article with blocks', 'journal', art({}, { blocks: [] }, { journalKey: 'j1' })],
    ['blocks', 'has-blocks', art({}, { blocks: [{ id: 't', type: 'text', html: 'A' }] })],
    ['empty blocks', 'has-blocks', art({}, { blocks: [] })],
    ['malformed blocks', 'has-blocks', art({}, { blocks: 'x' })],
    ['a legacy image without images', 'legacy-image-field', art({}, { image: img('a') })],
    ['a legacy image, empty images', 'legacy-image-field', art({}, { image: img('a'), images: [] })],
  ])('%s → %s', (_name, reason, s) => {
    expect(planArticleMigration(s)).toEqual({ action: 'leave', reason });
  });

  it('an empty journalKey is none, a legacy image next to images changes nothing', () => {
    expect(planArticleMigration(art({}, {}, { journalKey: '' })).action).toBe('migrate');
    expect(planArticleMigration(art({ position: VP.Top }, { image: img('z'), images: [img('a')] }))).toMatchObject({ shape: 'image-top' });
    expect(planArticleMigration(art({}, { image: null, images: [] }))).toMatchObject({ shape: 'text' });
  });

  it('does not touch the section and does not throw on malformed data', () => {
    const s = art({ position: VP.Left }, { images: [img('a')], cta });
    const before = json(s);
    planArticleMigration(s);
    expect(s).toEqual(before);
    for (const properties of [null, 3, 'x', [], { images: [null] }, { contentI18n: 3 }, { cta: 'x' }, { imageStyle: null }]) {
      expect(() => planArticleMigration({ type: 'article', properties } as unknown as MigratableSection)).not.toThrow();
    }
  });
});

describe('articleApplySkip', () => {
  const section = art({ position: VP.None }, { images: [img('a')] });
  const entry = json({ updateTime: '10.5', patch: patchOf(section) });
  const live = (s: MigratableSection = section, updateTime = '10.5') => ({ section: s, updateTime });

  it('undefined (write) for the unchanged document', () => {
    expect(articleApplySkip(entry, live(), 'scs')).toBeUndefined();
    expect(articleApplySkip(entry, live(art({ position: VP.None }, { images: [img('a')] }, { tenants: ['p13', 'scs'] })), 'p13')).toBeUndefined();
  });

  it('skips with a reason', () => {
    const changedText = { ...section, content: { htmlContent: '<p>Neu</p>', position: VP.None } };
    expect(articleApplySkip(entry, undefined, 'scs')).toBe('missing');
    expect(articleApplySkip(entry, live(), 'p13')).toBe('other-tenant');
    expect(articleApplySkip(entry, live({ ...section, tenants: undefined }), 'scs')).toBe('other-tenant');
    expect(articleApplySkip(entry, live(withMigrationPatch(section, entry.patch)), 'scs')).toBe('has-blocks');
    expect(articleApplySkip(entry, live(section, '10.6'), 'scs')).toBe('changed-since-trial');
    expect(articleApplySkip(entry, live(changedText), 'scs')).toBe('patch-differs');
    expect(articleApplySkip(entry, live({ ...section, journalKey: 'j' }), 'scs')).toBe('patch-differs');
    expect(articleApplySkip({ ...entry, patch: { blocks: entry.patch.blocks } }, live(), 'scs')).toBe('patch-differs');
  });
});

describe('articleUndoSkip', () => {
  const section = art({ position: VP.None }, { images: [img('a')] });
  const patch = json(patchOf(section));
  const migrated = withMigrationPatch(section, patch);
  const withProps = (more: object): MigratableSection => ({ ...migrated, properties: { ...migrated.properties, ...more } });

  it('undefined (undo) while blocks and cover are those of the plan', () => {
    expect(articleUndoSkip(patch, migrated, 'scs')).toBeUndefined();
    expect(articleUndoSkip(patch, { ...migrated, title: 'Neu' } as MigratableSection, 'scs')).toBeUndefined();
    const plain = art({ position: VP.Top }, { images: [img('a')] });
    expect(articleUndoSkip(json(patchOf(plain)), withMigrationPatch(plain, patchOf(plain)), 'scs')).toBeUndefined();
  });

  it('skips with a reason', () => {
    expect(articleUndoSkip(patch, undefined, 'scs')).toBe('missing');
    expect(articleUndoSkip(patch, migrated, 'p13')).toBe('other-tenant');
    expect(articleUndoSkip(patch, section, 'scs')).toBe('not-migrated');
    expect(articleUndoSkip(patch, withProps({ blocks: [{ id: 'classic-text', type: 'text', html: '<p>Neu</p>' }] }), 'scs')).toBe('edited');
    expect(articleUndoSkip(patch, withProps({ blocks: [] }), 'scs')).toBe('edited');
    expect(articleUndoSkip(patch, withProps({ cover: img('b') }), 'scs')).toBe('edited');
    expect(articleUndoSkip(patch, withProps({ cover: undefined }), 'scs')).toBe('edited');
  });

  it('never when the old fields no longer give this article (design §11 step 4 has removed them)', () => {
    expect(articleUndoSkip(patch, { ...migrated, content: undefined }, 'scs')).toBe('old-fields-changed');
    expect(articleUndoSkip(patch, withProps({ images: [] }), 'scs')).toBe('old-fields-changed');
    expect(articleUndoSkip(patch, { type: 'article', tenants: ['scs'], properties: patch }, 'scs')).toBe('old-fields-changed');
  });
});
