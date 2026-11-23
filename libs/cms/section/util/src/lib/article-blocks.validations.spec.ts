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

  it('flags an unknown type', () => {
    expect(run([{ id: 'x', type: 'video' }]).hasErrors('blocks.x.type')).toBe(true);
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
    expect(run([{ id: 'b', type: 'button', cta: { ...cta, label: '' } }]).hasErrors('blocks.b.cta')).toBe(true);
    expect(run([{ id: 'b', type: 'button', cta: { ...cta, url: 'javascript:alert(1)' } }]).hasErrors('blocks.b.cta')).toBe(true);
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
    expect(run([columns([col(6, [{ id: 'k', type: 'divider' }]), col(6)])]).hasErrors('blocks.k.type')).toBe(true);
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
