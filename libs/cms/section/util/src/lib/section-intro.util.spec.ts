import { ImageActionType, IMAGE_STYLE_SHAPE } from '@okr/shared-models';

import { getSectionIntro, heroBackgroundStyle, heroLogoStyle } from './section-intro.util';

describe('getSectionIntro', () => {
  it('returns the intro below the title by default', () => {
    expect(getSectionIntro({ intro: ' Vier Wege ' })).toEqual({ text: 'Vier Wege', position: 'below' });
  });

  it('honours an explicit position', () => {
    expect(getSectionIntro({ intro: 'Willkommen', introPosition: 'above' })).toEqual({ text: 'Willkommen', position: 'above' });
  });

  it('falls back to a legacy kicker above the title', () => {
    expect(getSectionIntro({ intro: '', properties: { kicker: 'Seit 1917' } })).toEqual({ text: 'Seit 1917', position: 'above' });
  });

  it('prefers the intro over a legacy kicker', () => {
    expect(getSectionIntro({ intro: 'Neu', properties: { kicker: 'Alt' } }).text).toBe('Neu');
  });

  it('is empty without either', () => {
    expect(getSectionIntro(undefined)).toEqual({ text: '', position: 'below' });
    expect(getSectionIntro({ properties: { kicker: 3 } }).text).toBe('');
  });
});

describe('hero image styles', () => {
  it('strips frame and action from the background and appends the extra imgix parameters', () => {
    const style = heroBackgroundStyle({ ...IMAGE_STYLE_SHAPE, imgIxParams: 'sat=-30' }, 'crop=top');
    expect(style).toMatchObject({ imgIxParams: 'sat=-30&crop=top', border: 'none', borderRadius: '0', action: ImageActionType.None, captionPosition: 'none' });
  });

  it('keeps the logo frame but never makes it clickable', () => {
    const style = heroLogoStyle({ ...IMAGE_STYLE_SHAPE, width: '200px', border: '2px solid' });
    expect(style).toMatchObject({ width: '200px', border: '2px solid', action: ImageActionType.None });
  });
});
