import { describe, expect, it } from 'vitest';
import { ARTICLE_SECTION_SHAPE, ArticleSection } from '@okr/shared-models';

import { articleSectionValidations } from './article-section.validations';

const image = { label: 'a', type: 1, url: 'tenant/scs/a.jpg', altText: 'a' };
const cta = { label: 'Los', url: 'https://example.org', style: 'primary' };
const slideshow = { effect: 'fade', autoplay: true, interval: 3, duration: 1 };

const text = (id: string, extra: object = {}) => ({ id, type: 'text', html: '<p>x</p>', ...extra });
const imageBlock = (id: string) => ({ id, type: 'image', image });

function run(blocks: unknown, extra: object = {}) {
  const model = { ...ARTICLE_SECTION_SHAPE, properties: { ...ARTICLE_SECTION_SHAPE.properties, blocks, ...extra } } as unknown as ArticleSection;
  return articleSectionValidations(model);
}

const columns = (cols: unknown[], id = 'c') => ({ id, type: 'columns', columns: cols });
const col = (size: number, blocks: unknown[] = [text('ct')]) => ({ size, blocks });

describe('article blocks validations', () => {
  it('accepts a valid article with all eight types', () => {
    const r = run([
      text('t1', { align: 'center' }),
      imageBlock('i1'),
      { id: 'g1', type: 'gallery', images: [image, image], layout: 'side-by-side', slideshow },
      { id: 'b1', type: 'button', cta, align: 'right' },
      columns([col(6, [text('ct1')]), col(6, [imageBlock('ci1'), { id: 'cb1', type: 'button', cta }])]),
      { id: 'k1', type: 'callout', html: '<p>x</p>', tone: 'neutral' },
      { id: 'd1', type: 'divider' },
      { id: 's1', type: 'space', size: 'large' },
    ], { cover: image });
    expect(r.getErrors()).toEqual({});
  });

  it('flags more than 50 blocks', () => {
    expect(run(Array.from({ length: 51 }, (_, i) => text(`t${i}`))).hasErrors('blocks')).toBe(true);
    expect(run(Array.from({ length: 50 }, (_, i) => text(`t${i}`))).hasErrors('blocks')).toBe(false);
  });

  it('flags a duplicate id, also across columns', () => {
    expect(run([text('a'), text('a')]).hasErrors('blocks')).toBe(true);
    expect(run([text('a'), columns([col(6, [text('a')]), col(6)])]).hasErrors('blocks')).toBe(true);
  });

  it('flags an empty id', () => {
    expect(run([text('')]).hasErrors('blocks')).toBe(true);
  });

  it('skips blocks of an unknown or missing type, in columns too, but their ids still count', () => {
    expect(run([{ id: 'x', type: 'video' }]).getErrors()).toEqual({});
    expect(run([{ id: 'x' }]).getErrors()).toEqual({});
    expect(run([columns([col(6, [{ id: 'u', type: 'video' }]), col(6)])]).getErrors()).toEqual({});
    expect(run([text('a'), { id: 'a', type: 'video' }]).hasErrors('blocks')).toBe(true);
  });

  it('requires German text when only translations exist, for text and callout', () => {
    expect(run([text('t', { html: '<p> </p>', htmlI18n: { en: '<p>Hi</p>' } })]).hasErrors('blocks.t.html')).toBe(true);
    expect(run([{ id: 'k', type: 'callout', tone: 'neutral', html: '', htmlI18n: { en: '<p>Hi</p>' } }]).hasErrors('blocks.k.html')).toBe(true);
    expect(run([text('t', { html: '<p>Hallo</p>', htmlI18n: { en: '<p>Hi</p>' } })]).hasErrors('blocks.t.html')).toBe(false);
    expect(run([text('t', { html: '' })]).getErrors()).toEqual({});
    expect(run([text('t', { html: '', htmlI18n: { en: '<p></p>' } })]).getErrors()).toEqual({});
  });

  it('reports the label and the url of a button separately', () => {
    const e = (c: unknown) => run([{ id: 'b', type: 'button', cta: c }]);
    expect(e({ ...cta, label: '' }).hasErrors('blocks.b.cta.label')).toBe(true);
    expect(e({ ...cta, label: '' }).hasErrors('blocks.b.cta.url')).toBe(false);
    expect(e({ ...cta, url: '' }).hasErrors('blocks.b.cta.url')).toBe(true);
    expect(e({ ...cta, url: 'javascript:alert(1)' }).hasErrors('blocks.b.cta.url')).toBe(true);
    expect(e({ ...cta, label: '', labelI18n: { en: 'Go' } }).hasErrors('blocks.b.cta.label')).toBe(true);
    expect(e({ ...cta, style: 'nope' }).hasErrors('blocks.b.cta.style')).toBe(true);
    expect(e(undefined).hasErrors('blocks.b.cta.label')).toBe(true);
  });

  it('flags an image block without image url and an empty gallery', () => {
    expect(run([{ id: 'i', type: 'image' }]).hasErrors('blocks.i.image.url')).toBe(true);
    expect(run([{ id: 'g', type: 'gallery', images: [] }]).hasErrors('blocks.g.images')).toBe(true);
  });

  it('flags an image block and a gallery without a picture, in columns too', () => {
    const empty = { ...image, url: '' };
    for (const url of ['', '  ', undefined, null, 5]) expect(run([{ id: 'i', type: 'image', image: { ...image, url } }]).hasErrors('blocks.i.image.url')).toBe(true);
    expect(run([columns([col(6, [{ id: 'ci', type: 'image', image: empty }]), col(6)])]).hasErrors('blocks.ci.image.url')).toBe(true);
    expect(run([{ id: 'g', type: 'gallery', images: [empty] }]).hasErrors('blocks.g.images')).toBe(true);
    expect(run([{ id: 'g', type: 'gallery', images: [empty, image] }]).hasErrors('blocks.g.images')).toBe(false);
    expect(run([text('t')], { cover: empty }).getErrors()).toEqual({});   // a cover may be empty: the first picture is taken
  });

  it('flags an image link that is not a safe target, in galleries, columns and the cover too', () => {
    const linked = (actionUrl: unknown) => ({ ...image, actionUrl });
    for (const bad of ['javascript:alert(1)', ' java\nscript:alert(1)', 'data:text/html,x', '/\\\\evil.example', 5]) {
      expect(run([{ id: 'i', type: 'image', image: linked(bad) }]).hasErrors('blocks.i.image.actionUrl')).toBe(true);
      expect(run([{ id: 'g', type: 'gallery', images: [image, linked(bad)] }]).hasErrors('blocks.g.images[1].actionUrl')).toBe(true);
      expect(run([columns([col(6, [{ id: 'ci', type: 'image', image: linked(bad) }]), col(6)])]).hasErrors('blocks.ci.image.actionUrl')).toBe(true);
      expect(run([text('t')], { cover: linked(bad) }).hasErrors('cover.actionUrl')).toBe(true);
    }
    for (const good of ['', undefined, null, 'https://example.org', 'http://example.org', 'mailto:a@b.ch', 'tel:044', '/seite', 'seite.html', 'www.example.org']) {
      expect(run([{ id: 'i', type: 'image', image: linked(good) }, { id: 'g', type: 'gallery', images: [linked(good)] }]).getErrors()).toEqual({});
    }
  });

  it('works for ids with dots', () => {
    expect(run([text('a.b', { align: 'x' })]).hasErrors('blocks.a.b.align')).toBe(true);
  });

  it('flags unknown align, tone, size, layout', () => {
    expect(run([text('t', { align: 'justify' })]).hasErrors('blocks.t.align')).toBe(true);
    expect(run([{ id: 'k', type: 'callout', html: '', tone: 'red' }]).hasErrors('blocks.k.tone')).toBe(true);
    expect(run([{ id: 's', type: 'space', size: 'huge' }]).hasErrors('blocks.s.size')).toBe(true);
    expect(run([{ id: 'g', type: 'gallery', images: [image], layout: 'nope' }]).hasErrors('blocks.g.layout')).toBe(true);
  });

  it('flags a slideshow outside the bounds', () => {
    expect(run([{ id: 'g', type: 'gallery', images: [image], slideshow: { ...slideshow, interval: 99 } }]).hasErrors('blocks.g.slideshow')).toBe(true);
  });

  it('flags a button without label or with an unsafe url', () => {
    expect(run([{ id: 'b', type: 'button', cta: { ...cta, label: '' } }]).hasErrors('blocks.b.cta.label')).toBe(true);
    expect(run([{ id: 'b', type: 'button', cta: { ...cta, url: 'javascript:alert(1)' } }]).hasErrors('blocks.b.cta.url')).toBe(true);
  });

  it('flags a broken image url and cover', () => {
    expect(run([{ id: 'i', type: 'image', image: { ...image, url: '/x.jpg' } }]).hasErrors('blocks.i.image.url')).toBe(true);
    expect(run([text('t')], { cover: { ...image, url: '/x.jpg' } }).hasErrors('cover.url')).toBe(true);
  });

  it('flags broken columns', () => {
    const bad = (cols: unknown[]) => run([columns(cols)]).hasErrors('blocks.c.columns');
    expect(bad([col(12)])).toBe(true);
    expect(bad([col(3), col(3), col(3), col(3)])).toBe(true);
    expect(bad([col(6), col(5)])).toBe(true);
    expect(bad([col(0), col(12)])).toBe(true);
    expect(bad([col(6, [columns([col(6), col(6)], 'inner')]), col(6)])).toBe(false);   // reported on the inner block
    expect(run([columns([col(6, [columns([col(6), col(6)], 'inner')]), col(6)])]).hasErrors('blocks.inner.columns')).toBe(true);
  });

  it('validates column content with the block rules', () => {
    expect(run([columns([col(6, [text('t', { align: 'justify' })]), col(6)])]).hasErrors('blocks.t.align')).toBe(true);
    expect(run([columns([col(6, [{ id: 'k', type: 'divider' }]), col(6)])]).hasErrors('blocks.k.type')).toBe(true);   // known, but not allowed in a column
  });

  it('validates the image style of image and gallery blocks, also in columns', () => {
    const bad = { zoomFactor: 99 };
    expect(run([{ ...imageBlock('i'), imageStyle: bad }]).hasErrors('blocks.i.imageStyle.zoomFactor')).toBe(true);
    expect(run([{ id: 'g', type: 'gallery', images: [image], imageStyle: bad }]).hasErrors('blocks.g.imageStyle.zoomFactor')).toBe(true);
    expect(run([columns([col(6, [{ ...imageBlock('ci'), imageStyle: bad }]), col(6)])]).hasErrors('blocks.ci.imageStyle.zoomFactor')).toBe(true);
    // flat names stay free of block errors
    expect(run([{ ...imageBlock('i'), imageStyle: bad }]).hasErrors('zoomFactor')).toBe(false);
  });

  it('flags a non-object image style and accepts a valid partial one', () => {
    expect(run([{ ...imageBlock('i'), imageStyle: 'x' }]).hasErrors('blocks.i.imageStyle')).toBe(true);
    expect(run([{ ...imageBlock('i'), imageStyle: null }]).hasErrors('blocks.i.imageStyle')).toBe(true);
    expect(run([{ ...imageBlock('i'), imageStyle: { zoomFactor: 2 } }]).getErrors()).toEqual({});
    expect(run([imageBlock('i')]).getErrors()).toEqual({});
  });

  it('does not throw on malformed stored data', () => {
    const malformed = [
      null, 'x', 5, [], {}, { id: 'a' }, { id: 'g', type: 'gallery' }, { id: 'i', type: 'image' },
      { id: 'b', type: 'button' }, { id: 'c', type: 'columns' }, { id: 'c2', type: 'columns', columns: [null, { size: 6 }, 'x'] },
      { id: 'g2', type: 'gallery', images: [null, 3], slideshow: 'x' },
    ];
    expect(() => run(malformed, { cover: 'x' })).not.toThrow();
    expect(() => run('not-an-array')).not.toThrow();
    expect(run(malformed).hasErrors('blocks')).toBe(true);
  });

  it('is unchanged for an old article without blocks', () => {
    const { blocks: _unused, ...properties } = { ...ARTICLE_SECTION_SHAPE.properties, blocks: undefined };
    const model = { ...ARTICLE_SECTION_SHAPE, properties } as unknown as ArticleSection;
    expect(articleSectionValidations(model).hasErrors()).toBe(false);
    const broken = { ...model, properties: { ...properties, cta: { label: 'x', url: '' } } } as unknown as ArticleSection;
    expect(articleSectionValidations(broken).hasErrors('cta.url')).toBe(true);
  });
});
