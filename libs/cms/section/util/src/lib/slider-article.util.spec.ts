import { describe, expect, it } from 'vitest';

import { IMAGE_STYLE_SHAPE, type ArticleSection, type GalleryBlock, type SectionModel, type SliderSection } from '@okr/shared-models';

import { asEditedSection, SLIDER_GALLERY_ID, sliderToArticle } from './slider-article.util';

const img = (url: string) => ({ url, label: url });
const slider = (properties: object, rest: object = {}): SliderSection => ({
  okey: 's1', type: 'slider', state: 'published', name: 'boote', title: 'Unsere Boote', subTitle: 'S', intro: 'I', introPosition: 'below',
  index: '1', color: 'primary', colSize: '12', roleNeeded: 'none', isArchived: false, notes: 'n', tags: 't', tenants: ['scs'],
  properties, ...rest,
}) as unknown as SliderSection;
const galleryOf = (s: ArticleSection): GalleryBlock => (s.properties.blocks ?? [])[0] as GalleryBlock;

describe('sliderToArticle', () => {
  it('keeps the id and every section field and turns the type into an article', () => {
    const source = slider({ images: [img('a.jpg')], imageStyle: IMAGE_STYLE_SHAPE });
    const s = sliderToArticle(source);
    const { type: _type, properties: _properties, ...fields } = source;   // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(s.type).toBe('article');
    expect(s).toMatchObject(fields);
  });

  it('puts the images in one gallery block in the carousel layout and keeps no old images', () => {
    const s = sliderToArticle(slider({ images: [img('a.jpg'), img('b.jpg')], imageStyle: IMAGE_STYLE_SHAPE }));
    expect(s.properties.images).toEqual([]);
    expect(s.properties.blocks).toEqual([{ id: SLIDER_GALLERY_ID, type: 'gallery', images: [img('a.jpg'), img('b.jpg')], layout: 'slider' }]);
  });

  it('stores only the drawn style values that differ from the defaults', () => {
    const imageStyle = { ...IMAGE_STYLE_SHAPE, width: '300px', height: '200px', fill: true, sizes: '50vw', borderRadius: '12px', imgIxParams: 'sat=-100' };
    expect(galleryOf(sliderToArticle(slider({ images: [img('a.jpg')], imageStyle }))).imageStyle).toEqual({ borderRadius: '12px', imgIxParams: 'sat=-100' });
  });

  it('copes with a slider stored without images or style', () => {
    expect(galleryOf(sliderToArticle(slider({})))).toEqual({ id: SLIDER_GALLERY_ID, type: 'gallery', images: [], layout: 'slider' });
    expect(galleryOf(sliderToArticle(slider(undefined as unknown as object))).images).toEqual([]);
  });

  it('does not change its input', () => {
    const source = slider({ images: [img('a.jpg')], imageStyle: { ...IMAGE_STYLE_SHAPE, width: '300px' } });
    const copy = structuredClone(source);
    sliderToArticle(source);
    expect(source).toEqual(copy);
  });
});

describe('asEditedSection', () => {
  it('converts a slider and returns any other section as it is', () => {
    expect(asEditedSection(slider({ images: [] })).type).toBe('article');
    const article = { okey: 'a1', type: 'article', properties: { images: [] } } as unknown as SectionModel;
    expect(asEditedSection(article)).toBe(article);
  });
});
