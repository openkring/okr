import { describe, expect, it } from 'vitest';
import { ARTICLE_SECTION_SHAPE, HERO_OVERLAY_DEFAULT, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, JournalChange } from '@okr/shared-models';
import { formatHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { SectionView, sectionsOf } from './journal-view.util';
import {
  addableSectionTypes, changedSectionFields, JOURNAL_SECTION_TYPES, newFootprintSections, sectionClipKeys, sectionFieldsOf,
  sectionImageKeys, sectionModelOf,
} from './journal-section.util';

const DEVICE: Record<string, string> = { bruno: 'dev-b', anna: 'dev-a' };
const hlc = (wall: number, author = 'bruno'): string => formatHlc({ wall, counter: 0, deviceId: DEVICE[author] });

let n = 0;
function rec(p: Pick<JournalChange, 'entity' | 'entityKey' | 'op'> & Partial<JournalChange>, wall: number, authorKey = 'bruno'): JournalChange {
  n += 1;
  return { id: `r${n}`, journalKey: 'j1', deviceId: DEVICE[authorKey], seq: n, hlc: hlc(wall, authorKey), authorKey, fields: {}, ...p };
}

const img = (label: string) => ({ ...IMAGE_CONFIG_SHAPE, label, url: '', altText: '' });
const FP = rec({ entity: 'footprint', entityKey: 'f1', op: 'create', fields: { journalKey: 'j1', title: 'Neko' } }, 10);
const ARTICLE = rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'article', title: '', htmlContent: '<p>C</p>', order: 'V' }, bases: {} }, 100);

function view(p: Partial<SectionView>): SectionView {
  return { key: 's1', type: 'article', title: '', htmlContent: '', properties: {}, order: 'V', authorKey: 'bruno', hlcs: {}, conflict: false, ...p };
}

describe('journal sections', () => {
  it('lists the four phase-2 types', () => {
    expect([...JOURNAL_SECTION_TYPES]).toEqual(['hero', 'article', 'album', 'video']);
  });

  it('sectionFieldsOf flattens properties to p_ fields and content to htmlContent', () => {
    const fields = sectionFieldsOf({
      type: 'article', title: 'T', content: { ...ARTICLE_SECTION_SHAPE.content, htmlContent: '<p>x</p>' },
      properties: { images: [img('i1')], imageStyle: IMAGE_STYLE_SHAPE },
    });
    expect(fields).toEqual({ type: 'article', title: 'T', htmlContent: '<p>x</p>', p_images: [img('i1')], p_imageStyle: IMAGE_STYLE_SHAPE });
  });

  it('sectionFieldsOf never stores a resolved image url: it is device- or time-bound', () => {
    const fields = sectionFieldsOf({
      type: 'album', title: '', content: ARTICLE_SECTION_SHAPE.content,
      properties: { images: [{ ...img('i1'), url: 'capacitor://localhost/_capacitor_file_/x.jpg' }] } as never,
    });
    expect(fields['p_images']).toEqual([img('i1')]);
  });

  it('two authors edit different keys of one article offline: both edits survive', () => {
    const anna = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>Anna</p>' }, bases: { htmlContent: ARTICLE.hlc } }, 200, 'anna');
    const bruno = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { p_imageStyle: { ...IMAGE_STYLE_SHAPE, width: '50%' } } }, 300);
    for (const order of [[FP, ARTICLE, anna, bruno], [bruno, anna, ARTICLE, FP]]) {
      const sections = sectionsOf(materialize(order), 'f1');
      expect(sections).toHaveLength(1);
      expect(sections[0].htmlContent).toBe('<p>Anna</p>');
      expect(sections[0].properties['imageStyle']).toEqual({ ...IMAGE_STYLE_SHAPE, width: '50%' });
      expect(sections[0].conflict).toBe(false);
    }
  });

  it('two authors change the text concurrently: the loser becomes a conflict copy', () => {
    const anna = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>Anna</p>' }, bases: { htmlContent: ARTICLE.hlc } }, 200, 'anna');
    const bruno = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { htmlContent: '<p>Bruno</p>' }, bases: { htmlContent: ARTICLE.hlc } }, 300);
    const sections = sectionsOf(materialize([FP, ARTICLE, anna, bruno]), 'f1');
    expect(sections.map((s) => [s.htmlContent, s.conflictOf, s.conflict, s.authorKey])).toEqual([
      ['<p>Bruno</p>', undefined, true, 'bruno'],
      ['<p>Anna</p>', 's1', true, 'anna'],
    ]);
    expect(sections[1].type).toBe('article');
    expect(sections[1].hlcs['htmlContent']).toBe(anna.hlc);
  });

  it('two authors change a settings key concurrently: no copy, the higher hlc wins', () => {
    const anna = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { p_imageStyle: { ...IMAGE_STYLE_SHAPE, width: '30%' } } }, 200, 'anna');
    const bruno = rec({ entity: 'section', entityKey: 's1', op: 'set', fields: { p_imageStyle: { ...IMAGE_STYLE_SHAPE, width: '70%' } } }, 300);
    const sections = sectionsOf(materialize([FP, ARTICLE, bruno, anna]), 'f1');
    expect(sections).toHaveLength(1);
    expect(sections[0].properties['imageStyle']).toEqual({ ...IMAGE_STYLE_SHAPE, width: '70%' });
    expect(sections[0].conflict).toBe(false);
  });

  it('an old block record without a type is ignored', () => {
    const block = rec({ entity: 'section', entityKey: 'b1', op: 'create', fields: { footprintKey: 'f1', kind: 'text', html: 'x', order: 'A' } }, 100);
    const unknown = rec({ entity: 'section', entityKey: 'b2', op: 'create', fields: { footprintKey: 'f1', type: 'map', order: 'B' } }, 110);
    expect(sectionsOf(materialize([FP, block, unknown]), 'f1')).toEqual([]);
  });

  it('a hero stays first even when its order is after an article', () => {
    const hero = rec({ entity: 'section', entityKey: 'h1', op: 'create', fields: { footprintKey: 'f1', type: 'hero', order: 'Z' } }, 120);
    const sections = sectionsOf(materialize([FP, ARTICLE, hero]), 'f1');
    expect(sections.map((s) => s.key)).toEqual(['h1', 's1']);
  });

  it('addableSectionTypes drops the hero once one exists', () => {
    expect(addableSectionTypes([view({ type: 'article' })])).toEqual(['hero', 'article', 'album', 'video']);
    expect(addableSectionTypes([view({ type: 'hero' }), view({ key: 's2' })])).toEqual(['article', 'album', 'video']);
  });

  it('changedSectionFields: nothing for an unchanged model, only the changed key otherwise', () => {
    const before = view({ htmlContent: '<p>C</p>', properties: { images: [img('i1')] } });
    const model = sectionModelOf(before, 'scs');
    expect(changedSectionFields(before, model)).toEqual({});
    const restyled = { ...model, properties: { ...model.properties, imageStyle: { ...IMAGE_STYLE_SHAPE, width: '50%' } } } as typeof model;
    expect(changedSectionFields(before, restyled)).toEqual({ p_imageStyle: { ...IMAGE_STYLE_SHAPE, width: '50%' } });
  });

  it('sectionModelOf overlays the view on the type defaults; image labels stay the journal image keys', () => {
    const model = sectionModelOf(view({ key: 'a1', type: 'album', order: 'M', properties: { images: [img('i1'), img('i2')] } }), 'scs');
    expect(model).toMatchObject({ okey: 'a1', name: 'a1', type: 'album', order: 'M', authorKey: 'bruno', tenants: ['scs'] });
    const props = model.properties as { images: { label: string }[]; albumStyle: string };
    expect(props.images.map((i) => i.label)).toEqual(['i1', 'i2']);
    expect(props.albumStyle).toBe('grid'); // the ALBUM_SECTION_SHAPE default
  });

  it('sectionImageKeys and sectionClipKeys read the photo and clip lists', () => {
    expect(sectionImageKeys(view({ type: 'album', properties: { images: [img('i1'), img('i2')] } }))).toEqual(['i1', 'i2']);
    expect(sectionImageKeys(view({ type: 'hero', properties: { hero: img('c1') } }))).toEqual(['c1']);
    expect(sectionImageKeys(view({ type: 'hero', properties: { hero: img('') } }))).toEqual([]);
    expect(sectionClipKeys(view({ type: 'video', properties: { clips: [img('v1')] } }))).toEqual(['v1']);
    expect(sectionClipKeys(view({ type: 'article' }))).toEqual([]);
  });

  it('newFootprintSections: a hero with the cover and the overlay, then an empty article', () => {
    const sections = newFootprintSections('c1');
    expect(sections.map((s) => s.type)).toEqual(['hero', 'article']);
    expect(sections[0].fields).toMatchObject({ type: 'hero', p_hero: img('c1'), p_overlay: HERO_OVERLAY_DEFAULT });
    expect(sections[1].fields).toEqual({ type: 'article', title: '', htmlContent: '' });
    expect(newFootprintSections('')[0].fields['p_hero']).toBeUndefined();
  });
});
