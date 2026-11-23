import { create } from 'vest';
import { describe, expect, it } from 'vitest';

import { IMAGE_CONFIG_SHAPE, type ArticleBlock, type ArticleConfig, type ArticleSection, type ImageConfig } from '@okr/shared-models';

import { articleBlocksValidations } from './article-blocks.validations';
import {
  articleImageChoices, coverErrors, galleryErrors, isPictureMissing, outdatedLanguagesOf, resizeColumn, restErrors, typingPath, uniqueFileName, withUpload,
} from './article-panel.util';
import type { SectionErrors } from './section-errors';

const image = (url: string, more: Partial<ImageConfig> = {}): ImageConfig => ({ ...IMAGE_CONFIG_SHAPE, url, ...more });
const article = (properties: Partial<ArticleConfig>): ArticleSection => ({ okey: 's', type: 'article', title: 'T', properties: { images: [], ...properties } } as unknown as ArticleSection);

describe('uniqueFileName', () => {
  it.each([
    ['bild.jpg', 'bild-ab12.jpg'],
    ['bild', 'bild-ab12'],
    ['a.b.jpg', 'a.b-ab12.jpg'],
    ['Grün Café.png', 'Grun-Cafe-ab12.png'],
    // nothing of the name is left: it must keep its extension
    ['日本.jpg', 'file-ab12.jpg'],
    ['.jpg', 'file-ab12.jpg'],
    ['', 'file-ab12'],
  ])('%s → %s', (name, expected) => {
    expect(uniqueFileName(name, 'ab12')).toBe(expected);
  });

  it('differs for another id', () => {
    expect(uniqueFileName('bild.jpg', 'x')).not.toBe(uniqueFileName('bild.jpg', 'y'));
  });
});

describe('resizeColumn', () => {
  it('lets the neighbour give or take', () => {
    expect(resizeColumn([6, 6], 0, 8)).toEqual([8, 4]);
    expect(resizeColumn([6, 6], 1, 8)).toEqual([4, 8]);
    expect(resizeColumn([4, 4, 4], 0, 3)).toEqual([3, 5, 4]);
    expect(resizeColumn([4, 4, 4], 2, 3)).toEqual([4, 5, 3]);
  });

  it('keeps every size at 1 to 11 and the sum at 12, whatever is chosen', () => {
    for (const sizes of [[6, 6], [1, 11], [4, 4, 4], [3, 6, 3], [10, 1, 1]]) {
      for (let index = 0; index < sizes.length; index++) {
        for (let size = 1; size <= 12 - (sizes.length - 1); size++) {
          const out = resizeColumn(sizes, index, size);
          expect(out[index]).toBe(size);
          expect(out.length).toBe(sizes.length);
          expect(out.reduce((sum, s) => sum + s, 0)).toBe(12);
          expect(out.every((s) => Number.isInteger(s) && s >= 1 && s <= 11)).toBe(true);
        }
      }
    }
  });

  it('takes from further columns when the neighbour is used up', () => {
    const out = resizeColumn([4, 4, 4], 1, 9);
    expect(out[1]).toBe(9);
    expect(out.reduce((sum, s) => sum + s, 0)).toBe(12);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(1);
  });

  it.each([
    [[6, 6], 0, 12], [[6, 6], 0, 0], [[6, 6], 0, 1.5], [[6, 6], 2, 4], [[6, 6], -1, 4], [[4, 4, 4], 0, 11], [[5, 5], 0, 6], [[12], 0, 6], [[6, 6], 0, Number.NaN],
  ])('leaves %j as it is for column %d and size %d', (sizes, index, size) => {
    expect(resizeColumn(sizes, index, size)).toBe(sizes);
  });

  it('does not change its input', () => {
    const sizes = [6, 6];
    resizeColumn(sizes, 0, 8);
    expect(sizes).toEqual([6, 6]);
  });
});

describe('articleImageChoices', () => {
  it('offers the pictures of the blocks and the cover once each', () => {
    const blocks: ArticleBlock[] = [
      { id: 'a', type: 'image', image: image('1.jpg', { overlay: 'first' }) },
      { id: 'g', type: 'gallery', images: [image('2.jpg'), image('1.jpg')] },
      { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [{ id: 'i', type: 'image', image: image('3.jpg') }] }, { size: 6, blocks: [] }] },
      { id: 'e', type: 'image', image: image('') },
    ];
    const choices = articleImageChoices(article({ blocks, cover: image('4.jpg') }));
    expect(choices.map((i) => i.url)).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg']);
    expect(choices[0].overlay).toBe('first');
  });

  it('does not offer a cover that a block shows, and is empty without blocks', () => {
    expect(articleImageChoices(article({ blocks: [{ id: 'a', type: 'image', image: image('1.jpg') }], cover: image('1.jpg') })).length).toBe(1);
    expect(articleImageChoices(article({}))).toEqual([]);
  });

  it('never throws on malformed data', () => {
    const broken = article({ blocks: [null, { id: 'g', type: 'gallery' }, { id: 'i', type: 'image', image: 3 }] as unknown as ArticleBlock[], cover: 'x' as unknown as ImageConfig });
    expect(articleImageChoices(broken)).toEqual([]);
  });
});

describe('withUpload', () => {
  const inner: ArticleBlock = { id: 'i', type: 'image', image: image('', { actionUrl: 'https://a.ch', overlay: 'alt' }) };
  const gallery: ArticleBlock = { id: 'g', type: 'gallery', images: [image('1.jpg')] };
  const text: ArticleBlock = { id: 't', type: 'text', html: '<p>x</p>' };
  const section = article({ blocks: [text, gallery, { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [inner] }, { size: 6, blocks: [] }] }] });
  const blocksOf = (s: ArticleSection) => s.properties.blocks as ArticleBlock[];

  it('puts the picture into the image block and keeps its link', () => {
    const out = withUpload(section, { kind: 'images', place: { blockId: 'i' }, images: [image('n.jpg'), image('o.jpg')] });
    const columns = blocksOf(out)[2] as Extract<ArticleBlock, { type: 'columns' }>;
    expect(columns.columns[0].blocks[0]).toEqual({ id: 'i', type: 'image', image: image('n.jpg', { actionUrl: 'https://a.ch' }) });
    expect(blocksOf(out)[0]).toBe(text);
    expect(blocksOf(section)[2]).not.toBe(columns);
  });

  it('appends to the gallery as it is now', () => {
    const out = withUpload(section, { kind: 'images', place: { blockId: 'g' }, images: [image('2.jpg'), image('3.jpg')] });
    expect((blocksOf(out)[1] as { images: ImageConfig[] }).images.map((i) => i.url)).toEqual(['1.jpg', '2.jpg', '3.jpg']);
  });

  it('sets the cover', () => {
    expect(withUpload(section, { kind: 'images', place: 'cover', images: [image('c.jpg')] }).properties.cover).toEqual(image('c.jpg'));
  });

  it.each([
    ['a block that is gone', { kind: 'images' as const, place: { blockId: 'gone' }, images: [image('n.jpg')] }],
    ['a block without pictures', { kind: 'images' as const, place: { blockId: 't' }, images: [image('n.jpg')] }],
    ['no picture', { kind: 'images' as const, place: 'cover' as const, images: [] }],
    ['details of no picture here', { kind: 'details' as const, details: [{ url: 'x.jpg', credit: 'Foto' }] }],
  ])('returns the same section for %s', (_name, upload) => {
    expect(withUpload(section, upload)).toBe(section);
  });

  it('adds the details to every picture with that url and never overwrites', () => {
    const start = article({
      blocks: [{ id: 'a', type: 'image', image: image('1.jpg') }, { id: 'g', type: 'gallery', images: [image('1.jpg', { credit: 'typed' }), image('2.jpg')] }, text],
      cover: image('1.jpg'),
    });
    const out = withUpload(start, { kind: 'details', details: [{ url: '1.jpg', documentKey: 'd', credit: 'file' }] });
    const [a, g, t] = blocksOf(out) as [Extract<ArticleBlock, { type: 'image' }>, Extract<ArticleBlock, { type: 'gallery' }>, ArticleBlock];
    expect(a.image).toMatchObject({ documentKey: 'd', credit: 'file' });
    expect(g.images[0]).toMatchObject({ documentKey: 'd', credit: 'typed' });
    expect(g.images[1]).toEqual(image('2.jpg'));
    expect(out.properties.cover).toMatchObject({ documentKey: 'd', credit: 'file' });
    expect(t).toBe(text);
    expect(withUpload(out, { kind: 'details', details: [{ url: '1.jpg', documentKey: 'other', credit: 'other' }] })).toBe(out);
  });

  it('reaches pictures in columns', () => {
    const start = withUpload(section, { kind: 'images', place: { blockId: 'i' }, images: [image('n.jpg')] });
    const out = withUpload(start, { kind: 'details', details: [{ url: 'n.jpg', credit: 'Foto' }] });
    const columns = blocksOf(out)[2] as Extract<ArticleBlock, { type: 'columns' }>;
    expect((columns.columns[0].blocks[0] as { image: ImageConfig }).image.credit).toBe('Foto');
    expect(blocksOf(out)[1]).toBe(gallery);
  });

  it('never throws on malformed blocks and keeps them', () => {
    const broken = article({ blocks: [null, { id: 'c', type: 'columns', columns: [null, { size: 6 }] }, { id: 'x', type: 'video', image: image('1.jpg') }] as unknown as ArticleBlock[] });
    expect(withUpload(broken, { kind: 'details', details: [{ url: '1.jpg', credit: 'Foto' }] })).toBe(broken);
  });
});

describe('typingPath', () => {
  const button: ArticleBlock = { id: 'b', type: 'button', cta: { label: 'A', url: '', style: 'primary' } };

  it('is the path of the one text that changed', () => {
    expect(typingPath(button, { ...button, cta: { ...button.cta, label: 'AB' } })).toBe('cta.label');
    expect(typingPath(article({ blocks: [] }), { ...article({ blocks: [] }), title: 'TT' })).toBe('title');
    const pic: ArticleBlock = { id: 'i', type: 'image', image: image('1.jpg') };
    expect(typingPath(pic, { ...pic, image: { ...pic.image, altText: 'x' } })).toBe('image.altText');
    expect(typingPath(pic, { ...pic, imageStyle: { width: '5' } })).toBe('imageStyle.width');
    expect(typingPath({ ...pic, imageStyle: { width: '5' } }, pic)).toBe('imageStyle.width');
  });

  it('is undefined for a choice, several changes and no change', () => {
    expect(typingPath(button, { ...button, align: 'center' })).toBeUndefined();
    expect(typingPath(button, { ...button, cta: { ...button.cta, style: 'secondary' } })).toBeUndefined();
    expect(typingPath(button, { ...button, cta: { ...button.cta, label: 'x', url: 'y' } })).toBeUndefined();
    expect(typingPath(button, { ...button })).toBeUndefined();
    expect(typingPath({ id: 'g', images: [image('1.jpg')] }, { id: 'g', images: [] })).toBeUndefined();
  });
});

describe('errors of the panel', () => {
  it('isPictureMissing: an image without a url, a gallery without pictures', () => {
    expect(isPictureMissing({ id: 'i', type: 'image', image: image('') })).toBe(true);
    expect(isPictureMissing({ id: 'i', type: 'image', image: image(' ') })).toBe(true);
    expect(isPictureMissing({ id: 'i', type: 'image' } as unknown as ArticleBlock)).toBe(true);
    expect(isPictureMissing({ id: 'i', type: 'image', image: image('1.jpg') })).toBe(false);
    expect(isPictureMissing({ id: 'g', type: 'gallery', images: [] })).toBe(true);
    expect(isPictureMissing({ id: 'g', type: 'gallery', images: [image('1.jpg')] })).toBe(false);
    expect(isPictureMissing({ id: 't', type: 'text', html: '' })).toBe(false);
  });

  it('restErrors: what no field shows', () => {
    const errors: SectionErrors = { align: ['a'], 'images[0].url': ['b'], 'image.url': ['b'], type: ['c'], empty: [] };
    expect(restErrors(errors, ['align', 'images[', 'image.'])).toEqual([{ field: 'type', messages: ['c'] }]);
    expect(restErrors(undefined, [])).toEqual([]);
  });

  it('coverErrors: under the names of an image list', () => {
    expect(coverErrors({ 'cover.url': ['x'], cover: ['y'], title: ['z'] })).toEqual({ 'images[0].url': ['x'] });
  });

  /** the keys the suite really reports for this gallery */
  const reported = (block: ArticleBlock): SectionErrors => {
    const suite = create(() => articleBlocksValidations({ images: [], blocks: [block] }));
    return Object.fromEntries(Object.entries(suite().getErrors()).map(([key, messages]) => [key.replace('blocks.g.', ''), messages as string[]]));
  };

  it('galleryErrors: the layout and the slideshow stand at their fields', () => {
    const block = { id: 'g', type: 'gallery', images: [image('tenant/t/1.jpg')], layout: 'x', slideshow: { effect: 'fade', autoplay: true, interval: 99, duration: 1 } } as ArticleBlock;
    const errors = galleryErrors(reported(block), block);
    expect(Object.keys(errors).sort()).toEqual(['imageLayout', 'slideshow.interval']);
  });

  it('galleryErrors: each field of the slideshow that is wrong', () => {
    const block = { id: 'g', type: 'gallery', images: [image('tenant/t/1.jpg')], slideshow: { effect: 'x', interval: null, duration: 9 } } as unknown as ArticleBlock;
    expect(Object.keys(galleryErrors(reported(block), block)).sort()).toEqual(['slideshow.duration', 'slideshow.effect', 'slideshow.interval']);
  });

  it('galleryErrors: a slideshow that is no object stays as it is', () => {
    const block = { id: 'g', type: 'gallery', images: [image('tenant/t/1.jpg')], slideshow: 'x' } as unknown as ArticleBlock;
    expect(Object.keys(galleryErrors(reported(block), block))).toEqual(['slideshow']);
  });
});

describe('outdatedLanguagesOf', () => {
  it('collects the languages of a block', () => {
    const paths = { 'blocks.a.htmlI18n': ['en', 'fr'], 'blocks.a.cta.labelI18n': ['en'], 'blocks.ab.htmlI18n': ['it'], titleI18n: ['es'] };
    expect(outdatedLanguagesOf(paths, 'a')).toEqual(['en', 'fr']);
    expect(outdatedLanguagesOf(paths, 'b')).toEqual([]);
  });
});
