import { ahvn2string, computeAhvn13checkDigit } from './ahv.util';

describe('ahv.util', () => {

    it('ahvn2string(empty) should return an empty string', () => {
        const _result = ahvn2string('');
        expect(_result).toEqual('');
    });
    // ahvn2string(null) or ahvn2string(undefined) are not possible because of strong type checking
    it('ahvn2string("short") should return an empty string', () => {
        const _result = ahvn2string('short');
        expect(_result).toEqual('');
    });
    it('ahvn2string("longlonglonglonglong") should return an empty string', () => {
        const _result = ahvn2string('longlonglonglonglong');
        expect(_result).toEqual('');
    });

    it('ahvn2string("7560803581661") should return "756.0803.5816.61"', () => {
        const _result = ahvn2string('7560803581661');
        expect(_result).toEqual('756.0803.5816.61');
    });

    it('ahvn2string("1234567890123") should return "123.4567.8901.23"', () => {
        const _result = ahvn2string('1234567890123');
        expect(_result).toEqual('123.4567.8901.23');
    });

    it('ahvn2string("123-45-6789-01A2") should return "" (not 13 digits)', () => {
        const _result = ahvn2string('123-45-6789-01A2');
        expect(_result).toEqual('');
    });

    it('ahvn2string("123-45-6789-01A2TEST3") should return "123.4567.8901.23"', () => {
        const _result = ahvn2string('123-45-6789-01A2TEST3');
        expect(_result).toEqual('123.4567.8901.23');
    });

    it('ahvn2string(1234567890123) should return "123.4567.8901.23"', () => {
        const _result = ahvn2string(1234567890123);
        expect(_result).toEqual('123.4567.8901.23');
    });

    it('computeAhvn13checkDigit("1234567890123") should not be 3 (invalid ahv number)', () => {
        const _result = computeAhvn13checkDigit('1234567890123');
        expect(_result).not.toEqual(3);
    });

    it('computeAhvn13checkDigit(7560803581661) should be 1', () => {
        const _result = computeAhvn13checkDigit('7560803581661');
        expect(_result).toEqual(1);
    });
});
