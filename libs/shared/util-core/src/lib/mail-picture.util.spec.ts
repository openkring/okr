import { describe, expect, it } from 'vitest';

import { MAIL_CONTENT_WIDTH, mailCaptionPosition, mailPictureWidth } from './mail-picture.util';

describe('mailPictureWidth', () => {
  it.each<[unknown, object]>([
    ['50%', { percent: 50 }], [' 33.5% ', { percent: 33.5 }], ['100%', { percent: 100 }], ['120%', { percent: 100 }], ['0%', { percent: 100 }], ['0.1%', { percent: 100 }],
    ['300px', { px: 300 }], ['300', { px: 300 }], ['300.6px', { px: 301 }], ['900px', { px: 440 }], ['0.5px', { px: 1 }], ['0.3px', { percent: 100 }],
    ['auto', { percent: 100 }], ['50vw', { percent: 100 }], ['-5px', { percent: 100 }], ['', { percent: 100 }], [undefined, { percent: 100 }], [5, { percent: 100 }], [{}, { percent: 100 }],
  ])('%j → %j', (raw, expected) => {
    expect(mailPictureWidth(raw)).toEqual(expected);
  });

  it('a part of its place that is less than half a pixel is no width', () => {
    expect(mailPictureWidth('1%', 100)).toEqual({ percent: 1 });
    expect(mailPictureWidth('1%', 40)).toEqual({ percent: 100 });
    expect(mailPictureWidth('300px', 100)).toEqual({ px: 300 });
  });

  it('the content of the seeded layouts', () => {
    expect(MAIL_CONTENT_WIDTH).toBe(440);
  });
});

describe('mailCaptionPosition', () => {
  it.each<[unknown, string]>([
    ['none', 'none'], [undefined, 'none'], ['', 'none'], [' ', 'none'], [3, 'none'], ['top', 'top'], [' top ', 'top'], ['bottom', 'bottom'],
    ['top-overlay', 'bottom'], ['middle-overlay', 'bottom'], ['bottom-overlay', 'bottom'], ['left', 'bottom'],
  ])('%j → %s', (raw, expected) => {
    expect(mailCaptionPosition(raw)).toBe(expected);
  });
});
