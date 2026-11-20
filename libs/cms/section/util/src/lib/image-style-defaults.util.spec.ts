import { IMAGE_STYLE_SHAPE, SectionModel } from '@okr/shared-models';

import { withImageStyleDefaults } from './image-style-defaults.util';

const section = (imageStyle?: object) => ({ type: 'article', properties: imageStyle ? { images: [], imageStyle } : { images: [] } }) as unknown as SectionModel;
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

  it('does not add an imageStyle to a section without one', () => {
    const s = section();
    expect(withImageStyleDefaults(s)).toBe(s);
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
