import { describe, it, expect } from 'vitest';
import { SectionModel } from '@bk2/shared-models';
import { getSectionImageSlots, sectionSupportsImages, isSlotOccupied, applyImagesToSlot } from './image-slots';

function section(type: string, properties: unknown): SectionModel {
  return { type, properties } as unknown as SectionModel;
}

const img = (url: string) => ({ url, label: url, type: 0, actionUrl: '', altText: '', overlay: '' });

describe('getSectionImageSlots', () => {
  it('returns a single multi-slot for article and slider', () => {
    expect(getSectionImageSlots(section('article', { images: [] }))).toEqual([{ field: 'images', multi: true }]);
    expect(getSectionImageSlots(section('slider', { images: [] }))).toEqual([{ field: 'images', multi: true }]);
  });

  it('returns two single-slots for hero', () => {
    expect(getSectionImageSlots(section('hero', {}))).toEqual([
      { field: 'logo', multi: false },
      { field: 'hero', multi: false },
    ]);
  });

  it('returns no slots for non-image sections', () => {
    expect(getSectionImageSlots(section('map', {}))).toEqual([]);
    expect(getSectionImageSlots(section('button', { imageStyle: {} }))).toEqual([]);
  });
});

describe('sectionSupportsImages', () => {
  it('is true only for article, slider, hero', () => {
    expect(sectionSupportsImages(section('article', {}))).toBe(true);
    expect(sectionSupportsImages(section('hero', {}))).toBe(true);
    expect(sectionSupportsImages(section('map', {}))).toBe(false);
  });
});

describe('isSlotOccupied', () => {
  it('multi slot is occupied when images[] is non-empty', () => {
    expect(isSlotOccupied(section('article', { images: [img('a.jpg')] }), { field: 'images', multi: true })).toBe(true);
    expect(isSlotOccupied(section('article', { images: [] }), { field: 'images', multi: true })).toBe(false);
  });

  it('single slot is occupied when the named image has a url', () => {
    expect(isSlotOccupied(section('hero', { logo: img('l.jpg') }), { field: 'logo', multi: false })).toBe(true);
    expect(isSlotOccupied(section('hero', { logo: { url: '' } }), { field: 'logo', multi: false })).toBe(false);
    expect(isSlotOccupied(section('hero', {}), { field: 'hero', multi: false })).toBe(false);
  });
});

describe('applyImagesToSlot', () => {
  it('appends to a multi slot', () => {
    const next = applyImagesToSlot(section('article', { images: [img('a.jpg')] }), { field: 'images', multi: true }, [img('b.jpg')]);
    expect((next.properties as { images: unknown[] }).images).toEqual([img('a.jpg'), img('b.jpg')]);
  });

  it('replaces a single slot with the first uploaded image', () => {
    const next = applyImagesToSlot(section('hero', { logo: img('old.jpg') }), { field: 'logo', multi: false }, [img('new.jpg')]);
    expect((next.properties as { logo: unknown }).logo).toEqual(img('new.jpg'));
  });

  it('does not mutate the input section', () => {
    const original = section('article', { images: [] });
    applyImagesToSlot(original, { field: 'images', multi: true }, [img('a.jpg')]);
    expect((original.properties as { images: unknown[] }).images).toEqual([]);
  });
});
