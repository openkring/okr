import { IMAGE_STYLE_SHAPE, SectionModel } from '@okr/shared-models';

import { compactSectionForSave, withImageStyleDefaults } from './image-style-defaults.util';

const section = (imageStyle?: object, type = 'article') => ({ type, properties: imageStyle ? { images: [], imageStyle } : { images: [] } }) as unknown as SectionModel;
const styleOf = (s: SectionModel) => (s.properties as { imageStyle?: Record<string, unknown> }).imageStyle;

describe('withImageStyleDefaults', () => {
  it('fills the fields an imported section lacks', () => {
    const style = styleOf(withImageStyleDefaults(section({ width: '100%', fill: true })));
    expect(style?.['isThumbnail']).toBe(false);
    expect(style?.['slot']).toBe('none');
  });

  it('keeps every value that is already set', () => {
    const style = styleOf(withImageStyleDefaults(section({ width: '50%', fill: true, border: '' })));
    expect(style?.['width']).toBe('50%');
    expect(style?.['fill']).toBe(true);
    expect(style?.['border']).toBe('');
  });

  it('leaves a complete style unchanged', () => {
    const s = section({ ...IMAGE_STYLE_SHAPE });
    expect(withImageStyleDefaults(s)).toEqual(s);
  });

  it('does not add an imageStyle to a non-article section without one', () => {
    const s = section(undefined, 'album');
    expect(withImageStyleDefaults(s)).toBe(s);
  });

  it('gives an article without an imageStyle the full default style (1.171 D1b)', () => {
    expect(styleOf(withImageStyleDefaults(section()))).toEqual(IMAGE_STYLE_SHAPE);
  });

  it('passes undefined through', () => {
    expect(withImageStyleDefaults(undefined)).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const s = section({ width: '100%' });
    withImageStyleDefaults(s);
    expect(styleOf(s)?.['isThumbnail']).toBeUndefined();
  });
});

describe('compactSectionForSave (1.171 D1b)', () => {
  it('drops an article imageStyle that equals the default', () => {
    const saved = compactSectionForSave(section({ ...IMAGE_STYLE_SHAPE }));
    expect(styleOf(saved)).toBeUndefined();
    expect('imageStyle' in (saved.properties as object)).toBe(false);
  });

  it('keeps only the differing fields of an article', () => {
    const saved = compactSectionForSave(section({ ...IMAGE_STYLE_SHAPE, height: '150px' }));
    expect(styleOf(saved)).toEqual({ height: '150px' });
  });

  it('keeps the other article properties', () => {
    const saved = compactSectionForSave(section({ ...IMAGE_STYLE_SHAPE }));
    expect((saved.properties as { images: unknown[] }).images).toEqual([]);
  });

  it('leaves other section types alone', () => {
    const s = section({ ...IMAGE_STYLE_SHAPE }, 'album');
    expect(compactSectionForSave(s)).toBe(s);
  });

  it('round-trips with withImageStyleDefaults', () => {
    const full = withImageStyleDefaults(section({ height: '300px' }));
    expect(withImageStyleDefaults(compactSectionForSave(full))).toEqual(full);
  });

  // spec 1.173: the form opens an article with withImageStyleDefaults and saves it with compactSectionForSave
  describe('an article with blocks and a cover', () => {
    const image = { label: 'a', type: 'image', url: 'a.jpg', actionUrl: '', altText: 'a', overlay: '' };
    const blockArticle = (extra: object = {}) => ({
      type: 'article',
      title: 'T',
      properties: {
        blocks: [
          { id: 't', type: 'text', html: '<p>x</p>', htmlI18n: { en: '<p>y</p>' } },
          { id: 'c', type: 'columns', columns: [
            { size: 6, blocks: [{ id: 'i', type: 'image', image, imageStyle: { height: '150px' } }] },
            { size: 6, blocks: [{ id: 'b', type: 'button', cta: { label: 'Los', url: '/x' } }] },
          ] },
        ],
        cover: image,
        ...extra,
      },
    }) as unknown as SectionModel;

    it('is saved as it was opened', () => {
      const s = blockArticle();
      expect(compactSectionForSave(withImageStyleDefaults(structuredClone(s)))).toEqual(s);
    });

    it('is saved as it was opened with the old fields still stored', () => {
      const s = blockArticle({ images: [image], imageStyle: { height: '300px' }, cta: { label: 'Alt', url: '/y' } });
      expect(compactSectionForSave(withImageStyleDefaults(structuredClone(s)))).toEqual(s);
    });
  });
});
