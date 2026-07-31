import { describe, expect, it } from 'vitest';
import * as masks from './masks';

describe('masks exports', () => {
  it('should export all mask objects and functions', () => {
    [
      'LowercaseWordMask',
      'UppercaseWordMask',
      'CaseInsensitiveWordMask',
      'LowercaseTextMask',
      'UppercaseTextMask',
      'CaseInsensitiveTextMask',
      'AnyCharacterMask',
      'HtmlTextMask',
      'SizeMask',
      'BexioIdMask',
      'ZoomMask',
      'What3WordMask',
      'ChVatMask',
      'ChSsnMask',
      'ChZipCodeMask',
      'PasswordMask',
      'ChIbanMask',
      'LatitudeMask',
      'LongitudeMask',
      'AltitudeMask',
      'ChAnyDate',
      'ChPastDate',
      'ChFutureDate',
      'ChTimeMask',
      'UsPhoneMask',
      'ChPhoneMask',
      'ChPartialDate',
    ].forEach(key => {
      expect(masks[key as keyof typeof masks]).toBeDefined();
    });
  });

  it('should have correct regex masks for word masks', () => {
    expect(masks.LowercaseWordMask.mask).toEqual(/^[a-z0-9-_]+$/i);
    expect(masks.UppercaseWordMask.mask).toEqual(/^[A-Z0-9-_]+$/i);
    expect(masks.CaseInsensitiveWordMask.mask).toEqual(/^[a-zA-Z0-9-_]+$/);
  });

  it('should have correct regex masks for text masks', () => {
    expect(masks.LowercaseTextMask.mask).toEqual(/^[a-z0-9-_ ]+$/);
    expect(masks.UppercaseTextMask.mask).toEqual(/^[A-Z0-9-_ ]+$/);
    expect(masks.CaseInsensitiveTextMask.mask).toEqual(/^[a-zA-Z0-9-_ ]+$/);
    expect(masks.AnyCharacterMask.mask).toEqual(/^[\s\S]+$/i);
  });

  it('should have correct mask for HtmlTextMask', () => {
    expect(masks.HtmlTextMask.mask).toEqual(/^[a-zA-Z0-9 !-/:-@[-`{-~]+$/);
  });

  it('should have correct mask for PasswordMask', () => {
    expect(masks.PasswordMask.mask).toEqual(/^[a-zA-Z0-9-_!@?:;äüö$*+&()=.,£$%]+$/);
  });

  it('should have number mask generators for coordinates', () => {
    expect(typeof masks.LatitudeMask).toBe('object');
    expect(typeof masks.LongitudeMask).toBe('object');
    expect(typeof masks.AltitudeMask).toBe('object');
  });

  it('should have date and time mask generators', () => {
    expect(typeof masks.ChAnyDate).toBe('object');
    expect(typeof masks.ChPastDate).toBe('object');
    expect(typeof masks.ChFutureDate).toBe('object');
    expect(typeof masks.ChTimeMask).toBe('object');
  });
});

describe('ChPartialDate', () => {
  const accepts = (value: string) => (masks.ChPartialDate.mask as RegExp).test(value);

  it('accepts a complete date and every prefix of it', () => {
    ['1', '15', '15.', '15.0', '15.04', '15.04.', '15.04.1', '15.04.1985'].forEach(v =>
      expect(accepts(v)).toBe(true));
  });

  it('accepts a bare year and every prefix of it', () => {
    ['1', '19', '198', '1985'].forEach(v => expect(accepts(v)).toBe(true));
  });

  it('accepts a birthday with a trailing dot', () => {
    expect(accepts('15.04.')).toBe(true);
  });

  it('rejects a separator after more than two leading digits', () => {
    expect(accepts('1985.')).toBe(false);
  });

  it('rejects more than four year digits and stray characters', () => {
    expect(accepts('15.04.19855')).toBe(false);
    expect(accepts('15.04.198x')).toBe(false);
    expect(accepts('15..04')).toBe(false);
  });

  // regression: a complete but unpadded date must stay typeable. Unlike ChAnyDate
  // (maskitoDateOptionsGenerator, which auto-pads), a bare-RegExp mask inserts nothing, so
  // date-input's full-date branch has to accept these forms directly (see date.util's
  // parseFullViewDate).
  it('accepts a complete date with an unpadded day and/or month', () => {
    expect(accepts('15.4.1985')).toBe(true);
    expect(accepts('5.4.1985')).toBe(true);
  });

  it('rejects a double separator after the month', () => {
    expect(accepts('15.04..')).toBe(false);
  });
});
