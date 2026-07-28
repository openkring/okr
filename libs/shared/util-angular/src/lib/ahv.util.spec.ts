import { describe, expect, it } from 'vitest';
import { ahvn2string, AhvFormat, computeAhvn13checkDigit, formatAhv } from './ahv.util';

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

    it('strips separators and other non-digits before formatting', () => {
        expect(formatAhv(' 756 0803 5816 61 ')).toEqual('756.0803.5816.61');
        expect(formatAhv('756-0803-5816-61', AhvFormat.Electronic)).toEqual('7560803581661');
    });
});
