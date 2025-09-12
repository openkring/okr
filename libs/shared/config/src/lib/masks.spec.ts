import { describe, expect, it } from 'vitest';
import * as masks from './masks';

describe('masks exports', () => {
  it('should export all mask objects and functions', () => {
    [
      'MaskPredicate',
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
    ].forEach(key => {
      expect(masks[key as keyof typeof masks]).toBeDefined();
    });
  });

  it('should have correct regex masks for word masks', () => {
    expect(masks.LowercaseWordMask.mask).toEqual(/^[a-z0-9-_]+$/);
    expect(masks.UppercaseWordMask.mask).toEqual(/^[A-Z0-9-_]+$/);
    expect(masks.CaseInsensitiveWordMask.mask).toEqual(/^[a-zA-Z0-9-_]+$/);
  });

  it('should have correct regex masks for text masks', () => {
    expect(masks.LowercaseTextMask.mask).toEqual(/^[a-z0-9-_ ]+$/);
    expect(masks.UppercaseTextMask.mask).toEqual(/^[A-Z0-9-_ ]+$/);
    expect(masks.CaseInsensitiveTextMask.mask).toEqual(/^[a-zA-Z0-9-_ ]+$/);
    expect(masks.AnyCharacterMask.mask).toEqual(/^[\s\S]+$/);
  });

  it('should have correct mask for HtmlTextMask', () => {
    expect(masks.HtmlTextMask.mask).toEqual(/^[a-zA-Z0-9 !-/:-@[-`{-~]+$/);
  });

  it('should have correct mask for PasswordMask', () => {
    expect(masks.PasswordMask.mask).toEqual(/^[a-zA-Z0-9_!@?:;äüö$*+&()=]+$/);
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
