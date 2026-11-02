import { describe, expect, it } from 'vitest';
import { ahvn2string, AhvFormat, checkAhv, computeAhvn13checkDigit, formatAhv, isBlankAhv, isSsnField, maskAhv, normalizeAhv } from './ahv.util';

describe('ahv.util', () => {

    it('ahvn2string(empty) should return an empty string', () => {
        const result = ahvn2string('');
        expect(result).toEqual('');
    });
    // ahvn2string(null) or ahvn2string(undefined) are not possible because of strong type checking
    it('ahvn2string("short") should return an empty string', () => {
        const result = ahvn2string('short');
        expect(result).toEqual('');
    });
    it('ahvn2string("longlonglonglonglong") should return an empty string', () => {
        const result = ahvn2string('longlonglonglonglong');
        expect(result).toEqual('');
    });

    it('ahvn2string("7560803581661") should return "756.0803.5816.61"', () => {
        const result = ahvn2string('7560803581661');
        expect(result).toEqual('756.0803.5816.61');
    });

    it('ahvn2string("1234567890123") should return "123.4567.8901.23"', () => {
        const result = ahvn2string('1234567890123');
        expect(result).toEqual('123.4567.8901.23');
    });

    it('ahvn2string("123-45-6789-01A2") should return "" (not 13 digits)', () => {
        const result = ahvn2string('123-45-6789-01A2');
        expect(result).toEqual('');
    });

    it('ahvn2string("123-45-6789-01A2TEST3") should return "123.4567.8901.23"', () => {
        const result = ahvn2string('123-45-6789-01A2TEST3');
        expect(result).toEqual('123.4567.8901.23');
    });

    it('ahvn2string(1234567890123) should return "123.4567.8901.23"', () => {
        const result = ahvn2string(1234567890123);
        expect(result).toEqual('123.4567.8901.23');
    });

    it('computeAhvn13checkDigit("1234567890123") should not be 3 (invalid ahv number)', () => {
        const result = computeAhvn13checkDigit('1234567890123');
        expect(result).not.toEqual(3);
    });

    it('computeAhvn13checkDigit(7560803581661) should be 1', () => {
        const result = computeAhvn13checkDigit('7560803581661');
        expect(result).toEqual(1);
    });
});

describe('formatAhv', () => {

    it('formats a complete number in the friendly format by default', () => {
        expect(formatAhv('7560803581661')).toEqual('756.0803.5816.61');
    });

    it('formats a complete number in the electronic format', () => {
        expect(formatAhv('756.0803.5816.61', AhvFormat.Electronic)).toEqual('7560803581661');
    });

    it('re-formats an already friendly number', () => {
        expect(formatAhv('756.0803.5816.61')).toEqual('756.0803.5816.61');
    });

    // ssn fields bind formatAhv inside a linkedSignal over live form data, so it sees every
    // intermediate keystroke. It must NEVER throw there — that aborts template rendering and
    // the field's validation error never gets a chance to show. Incomplete input comes back
    // verbatim so it does not fight the maskito mask under the user's cursor.
    it('hands back incomplete input unchanged while the user is still typing (never throws)', () => {
        expect(formatAhv('756292318310')).toEqual('756292318310');           // 12 digits
        expect(formatAhv('7562', AhvFormat.Electronic)).toEqual('7562');     // 4 digits
        expect(formatAhv('756.2923.1831.0')).toEqual('756.2923.1831.0');     // partially masked
    });

    it('returns an empty string for empty, null or undefined input (ahv is optional)', () => {
        expect(formatAhv('')).toEqual('');
        expect(formatAhv(null)).toEqual('');
        expect(formatAhv(undefined)).toEqual('');
    });

    it('leaves a complete number alone regardless of separators', () => {
        expect(formatAhv('756.0803.5816.61', AhvFormat.Friendly)).toEqual('756.0803.5816.61');
    });

    it('strips separators and other non-digits before formatting', () => {
        expect(formatAhv(' 756 0803 5816 61 ')).toEqual('756.0803.5816.61');
        expect(formatAhv('756-0803-5816-61', AhvFormat.Electronic)).toEqual('7560803581661');
    });
});

describe('isBlankAhv', () => {

    // ChSsnMask opens with the literals '7','5','6','.', so a field the user has cleared reads
    // '756.' (or a truncation of it), never ''. That is scaffolding, not a number.
    it('treats an empty field and the bare mask scaffolding as blank', () => {
        expect(isBlankAhv('')).toBe(true);
        expect(isBlankAhv(null)).toBe(true);
        expect(isBlankAhv(undefined)).toBe(true);
        expect(isBlankAhv('.')).toBe(true);
        expect(isBlankAhv('7')).toBe(true);
        expect(isBlankAhv('75')).toBe(true);
        expect(isBlankAhv('756')).toBe(true);
        expect(isBlankAhv('756.')).toBe(true);
    });

    // from the first digit the user contributes it is a partial number, which must be reported
    it('treats anything past the country code as a (partial) number', () => {
        expect(isBlankAhv('756.0')).toBe(false);
        expect(isBlankAhv('756292318310')).toBe(false);
        expect(isBlankAhv('756.0803.5816.61')).toBe(false);
        expect(isBlankAhv('123')).toBe(false);
    });
});

describe('maskAhv', () => {

    // the masked value is what an activity payload may carry: `activities` is tenant-readable,
    // so the raw AHV must never be copied there (privacy 1.19 gate).
    it('keeps only the country code and the last two digits', () => {
        expect(maskAhv('7560803581661')).toEqual('756.****.****.61');
        expect(maskAhv('756.0803.5816.61')).toEqual('756.****.****.61');
    });

    it('returns an empty string for anything that is not a complete number', () => {
        expect(maskAhv('')).toEqual('');
        expect(maskAhv(null)).toEqual('');
        expect(maskAhv(undefined)).toEqual('');
        expect(maskAhv('756.')).toEqual('');
        expect(maskAhv('756292318310')).toEqual('');
    });
});

describe('checkAhv', () => {

    it('accepts a valid number in either notation', () => {
        expect(checkAhv('7560803581661')).toBe(true);
        expect(checkAhv('756.0803.5816.61')).toBe(true);
    });

    it('rejects empty, too short, wrong country code and bad checksum', () => {
        expect(checkAhv('')).toBe(false);
        expect(checkAhv('756292318310')).toBe(false);     // 12 digits
        expect(checkAhv('1234567890123')).toBe(false);    // not 756
        expect(checkAhv('7560803581662')).toBe(false);    // checksum off by one
    });

    // EAN-13: a crosssum that already is a multiple of 10 gives check digit 0, not 10
    it('accepts a valid number whose check digit is 0', () => {
        expect(computeAhvn13checkDigit('7560000000040')).toEqual(0);
        expect(checkAhv('756.0000.0000.40')).toBe(true);
        expect(checkAhv('756.0000.0000.41')).toBe(false);
    });

    it('accepts the placeholder the form builder shows', () => {
        expect(checkAhv('756.1234.5678.97')).toBe(true);
    });
});

describe('normalizeAhv', () => {

    it('stores a valid number in the electronic format, whatever the notation', () => {
        expect(normalizeAhv('756.0803.5816.61')).toEqual('7560803581661');
        expect(normalizeAhv(' 7560803581661 ')).toEqual('7560803581661');
        expect(normalizeAhv(7560803581661)).toEqual('7560803581661');
    });

    it('reads no number — empty, absent or the bare mask scaffolding — as empty', () => {
        expect(normalizeAhv('')).toEqual('');
        expect(normalizeAhv(undefined)).toEqual('');
        expect(normalizeAhv(null)).toEqual('');
        expect(normalizeAhv('756.')).toEqual('');
    });

    it('rejects an incomplete or wrong number and anything that is not text', () => {
        expect(normalizeAhv('756.0803.5816.6')).toBeUndefined();
        expect(normalizeAhv('756.0803.5816.62')).toBeUndefined();
        expect(normalizeAhv({ ssn: '7560803581661' })).toBeUndefined();
        expect(normalizeAhv(['7560803581661'])).toBeUndefined();
        expect(normalizeAhv(true)).toBeUndefined();
    });
});

describe('isSsnField', () => {

    it('is an ssn field, or any field keyed ssnId (a legacy text field)', () => {
        expect(isSsnField({ type: 'ssn', key: 'ahv' })).toBe(true);
        expect(isSsnField({ type: 'text', key: 'ssnId' })).toBe(true);
        expect(isSsnField({ type: 'text', key: 'lastName' })).toBe(false);
        expect(isSsnField(undefined)).toBe(false);
    });
});
