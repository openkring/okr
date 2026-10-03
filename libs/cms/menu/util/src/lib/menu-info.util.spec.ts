import { describe, expect, it } from 'vitest';

import { menuInfoKey, normalizeMenuInfo } from './menu-info.util';

describe('normalizeMenuInfo', () => {
  it('treats missing, blank and empty editor content as no info', () => {
    for (const info of [undefined, null, '', '   ', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>', '<p></p><p></p>']) {
      expect(normalizeMenuInfo(info)).toBe('');
    }
  });

  it('keeps real content, trimmed', () => {
    expect(normalizeMenuInfo('  <p>Hallo <b>du</b></p> ')).toBe('<p>Hallo <b>du</b></p>');
    expect(normalizeMenuInfo('plain text')).toBe('plain text');
  });
});

describe('menuInfoKey', () => {
  it('finds a bare key and one wrapped in a single paragraph', () => {
    expect(menuInfoKey('@cms/menu/feature.info.label')).toBe('@cms/menu/feature.info.label');
    expect(menuInfoKey('<p>@item.game-backgammon</p>')).toBe('@item.game-backgammon');
    expect(menuInfoKey('<p> @help.text </p>')).toBe('@help.text');
  });

  it('does not treat HTML or prose that mentions a key as a key', () => {
    expect(menuInfoKey('<p>Mail an @vorstand</p>')).toBeUndefined();
    expect(menuInfoKey('<p><b>@item.x</b></p>')).toBeUndefined();
    expect(menuInfoKey('<p>Hallo</p>')).toBeUndefined();
  });
});
