import { describe, expect, it } from 'vitest';
import * as constants from './constants';

describe('constants exports', () => {
  it('should export all expected patterns and values', () => {
    [
      'SSN_PATTERN',
      'TAX_ID_PATTERN',
      'IBAN_PATTERN',
      'NAME_PATTERN',
      'NAME_NUMBER_PATTERN',
      'ALL_CHARS_PATTERN',
      'SPECIAL_CHARS_PATTERN',
      'INTEGER_PATTERN',
      'PHONE_PATTERN',
      'AVATAR_URL',
      'AVATAR_ROUND_URL',
      'SHOW_FOOTER',
      'THUMBNAIL_SIZE',
      'AVATAR_SIZE_SMALL',
      'LOGO_WIDTH',
      'LOGO_HEIGHT',
      'BUTTON_WIDTH',
      'BUTTON_HEIGHT',
      'ICON_SIZE',
      'END_FUTURE_DATE',
      'END_FUTURE_DATE_STR',
      'START_PAST_DATE',
      'START_PAST_DATE_STR',
      'MIN_YEAR',
      'MAX_YEAR',
      'MODAL_STYLE',
      'TOAST_LENGTH',
      'NAME_LENGTH',
      'SHORT_NAME_LENGTH',
      'LONG_NAME_LENGTH',
      'ABBREVIATION_LENGTH',
      'WORD_LENGTH',
      'STREET_LENGTH',
      'CITY_LENGTH',
      'ZIP_LENGTH',
      'INT_LENGTH',
      'NUMBER_LENGTH',
      'SHORT_NUMBER_LENGTH',
      'COUNTRY_LENGTH',
      'CURRENCY_LENGTH',
      'DESCRIPTION_LENGTH',
      'COMMENT_LENGTH',
      'EMAIL_LENGTH',
      'PHONE_LENGTH',
      'IBAN_LENGTH',
      'BEXIO_ID_LENGTH',
      'TAX_ID_LENGTH',
      'SSN_LENGTH',
      'DATE_LENGTH',
      'STORE_DATE_LENGTH',
      'STORE_DATETIME_LENGTH',
      'TIME_LENGTH',
      'LOCKER_LENGTH',
      'KEY_LENGTH',
      'URL_LENGTH',
      'PASSWORD_MIN_LENGTH',
      'PASSWORD_MAX_LENGTH',
      'DESCRIPTION_ROWS',
      'COMMENT_ROWS',
      'DEBOUNCE_TIME'
    ].forEach(key => {
      expect(constants[key as keyof typeof constants]).toBeDefined();
    });
  });

  it('should have correct values for some key patterns', () => {
    expect(constants.SSN_PATTERN).toBe('756[0-9]*');
    expect(constants.TAX_ID_PATTERN).toBe('^CHE[0-9]*');
    expect(constants.IBAN_PATTERN).toBe('^CH[0-9]*');
    expect(constants.NAME_PATTERN).toBe('[a-zA-Z öüäéâàèç-]*');
    expect(constants.ALL_CHARS_PATTERN).toBe('[!-~]*');
    expect(constants.INTEGER_PATTERN).toBe('[0-9]*');
    expect(constants.PHONE_PATTERN).toBe('[- +()0-9]{6,}');
  });

  it('should have correct boolean and number values', () => {
    expect(constants.SHOW_FOOTER).toBeTypeOf('boolean');
    expect(constants.THUMBNAIL_SIZE).toBeTypeOf('number');
    expect(constants.AVATAR_SIZE_SMALL).toBeTypeOf('number');
    expect(constants.LOGO_WIDTH).toBeTypeOf('number');
    expect(constants.LOGO_HEIGHT).toBeTypeOf('number');
  });
});