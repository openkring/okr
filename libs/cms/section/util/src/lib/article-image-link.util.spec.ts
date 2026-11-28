import { describe, expect, it } from 'vitest';

import { SectionModel } from '@okr/shared-models';

import { isImageLinked } from './article-image-link.util';

const URL = 'tenant/t1/section/s1/image/a.jpg';
const image = (url = URL) => ({ label: 'a', type: 'image', url, actionUrl: '', altText: 'a', overlay: '' });
const section = (properties: unknown, type = 'article') => ({ type, properties }) as unknown as SectionModel;
const withBlocks = (blocks: unknown, extra: object = {}) => section({ blocks, ...extra });
const text = { id: 't', type: 'text', html: '<p>x</p>' };

describe('isImageLinked', () => {
  it('finds the image of an image block', () => {
    expect(isImageLinked(withBlocks([text, { id: 'i', type: 'image', image: image() }]), URL)).toBe(true);
  });

  it('finds any image of a gallery block', () => {
    expect(isImageLinked(withBlocks([{ id: 'g', type: 'gallery', images: [image('other.jpg'), image()] }]), URL)).toBe(true);
  });

  it('finds an image inside a column', () => {
    const columns = { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [text] }, { size: 6, blocks: [{ id: 'i', type: 'image', image: image() }] }] };
    expect(isImageLinked(withBlocks([columns]), URL)).toBe(true);
  });

  it('finds the cover, and the block images next to a cover', () => {
    expect(isImageLinked(withBlocks([text], { cover: image() }), URL)).toBe(true);
    expect(isImageLinked(withBlocks([{ id: 'i', type: 'image', image: image() }], { cover: image('cover.jpg') }), URL)).toBe(true);
  });

  it('ignores the old images next to blocks', () => {
    expect(isImageLinked(withBlocks([text], { images: [image()] }), URL)).toBe(false);
  });

  it('finds the image of an article without blocks', () => {
    expect(isImageLinked(section({ images: [image('other.jpg'), image()] }), URL)).toBe(true);
  });

  it('does not look at the cover of an article without blocks', () => {
    expect(isImageLinked(section({ images: [], cover: image() }), URL)).toBe(false);
  });

  it('is false when the image is not linked', () => {
    expect(isImageLinked(withBlocks([text, { id: 'i', type: 'image', image: image('other.jpg') }]), URL)).toBe(false);
    expect(isImageLinked(withBlocks([]), URL)).toBe(false);
    expect(isImageLinked(section({ images: [image('other.jpg')] }), URL)).toBe(false);
  });

  it('does not throw on missing or malformed data', () => {
    expect(isImageLinked(section(undefined), URL)).toBe(false);
    expect(isImageLinked(section({}), URL)).toBe(false);
    expect(isImageLinked(section({ images: [null] }), URL)).toBe(false);
    expect(isImageLinked(withBlocks([{ id: 'g', type: 'gallery' }, null], { cover: null }), URL)).toBe(false);
  });
});
