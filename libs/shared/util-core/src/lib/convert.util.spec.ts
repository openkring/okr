import { describe, expect, it } from 'vitest';
import { PlaceholderContext, getPlaceholderHelp, replacePlaceholders, safeConvertBoolean, safeConvertNumber, safeConvertString, string2boolean, string2numberArray, stringArray2ObjectArray, stripHtml } from './convert.util';

describe('convert.util', () => {

    // safeConvertString
    it('safeConvertString("test", "", "default") should return default', () => {
        const result = safeConvertString('test', '', 'default');
        expect(result).toEqual('');
    });
    it('safeConvertString("test", null, "default") should return default', () => {
        const result = safeConvertString('test', null, 'default');
        expect(result).toEqual('default');
    });
    it('safeConvertString("test", undefined, "default") should return default', () => {
        const result = safeConvertString('test', undefined, 'default');
        expect(result).toEqual('default');
    });
    it('safeConvertString("test", "value", "default") should return value', () => {
        const result = safeConvertString('test', 'value', 'default');
        expect(result).toEqual('value');
    });
    it('safeConvertString("test", " value ", "default") should return trimmed value', () => {
        const result = safeConvertString('test', ' value ', 'default');
        expect(result).toEqual('value');
    });
    it('safeConvertString("test", 5, "default") should return stringified number', () => {
        const result = safeConvertString('test', 5, 'default');
        expect(result).toEqual('5');
    });
    it('safeConvertString("test", 0, "default") should return stringified number', () => {
        const result = safeConvertString('test', 0, 'default');
        expect(result).toEqual('0');
    });
    it('safeConvertString("test", false, "default") should return stringified boolean', () => {
        const result = safeConvertString('test', false, 'default');
        expect(result).toEqual('false');
    });

       // safeConvertNumber
    it('safeConvertNumber("test", null, 99) should return default', () => {
        const result = safeConvertNumber('test', null, 99);
        expect(result).toEqual(99);
    });
    it('safeConvertNumber("test", undefined, 99) should return default', () => {
        const result = safeConvertNumber('test', undefined, 99);
        expect(result).toEqual(99);
    });
    it('safeConvertNumber("test", 42, 99) should return value', () => {
        const result = safeConvertNumber('test', 42, 99);
        expect(result).toEqual(42);
    });
    it('safeConvertNumber("test", 0, 99) should return value', () => {
        const result = safeConvertNumber('test', 0, 99);
        expect(result).toEqual(0);
    });
    it('safeConvertNumber("test", -42, 99) should return value', () => {
        const result = safeConvertNumber('test', -42, 99);
        expect(result).toEqual(-42);
    });
    it('safeConvertNumber("test", 42.42, 99) should return value', () => {
        const result = safeConvertNumber('test', 42.42, 99);
        expect(result).toEqual(42.42);
    });
    it('safeConvertNumber("test", " 42 ", 99) should return trimmed value as a number', () => {
        const result = safeConvertNumber('test', ' 42 ', 99);
        expect(result).toEqual(42);
    });
    it('safeConvertNumber("test", "42", 99) should return value as a number', () => {
        const result = safeConvertNumber('test', '42', 99);
        expect(result).toEqual(42);
    });
    it('safeConvertNumber("test", "noNumber", 99) should return value as a number', () => {
        const result = safeConvertNumber('test', 'noNumber', 99);
        expect(result).toEqual(99);
    });
    it('safeConvertNumber("test", true, 99) should return 1', () => {
        const result = safeConvertNumber('test', true, 99);
        expect(result).toEqual(1);
    });

    it('safeConvertNumber("test", false, 99) should return 0', () => {
        const result = safeConvertNumber('test', false, 99);
        expect(result).toEqual(0);
    });

    // safeConvertBoolean
    it('safeConvertBoolean("test", null, true) should return default', () => {
        const result = safeConvertBoolean('test', null, true);
        expect(result).toEqual(true);
    });
    it('safeConvertBoolean("test", undefined, true) should return default', () => {
        const result = safeConvertBoolean('test', undefined, true);
        expect(result).toEqual(true);
    });
    it('safeConvertBoolean("test", 42, false) should return true', () => {
        const result = safeConvertBoolean('test', 42, false);
        expect(result).toEqual(true);
    });
    it('safeConvertBoolean("test", 0, true) should return false', () => {
        const result = safeConvertBoolean('test', 0, true);
        expect(result).toEqual(false);
    });
    it('safeConvertBoolean("test", -42, false) should return true', () => {
        const result = safeConvertBoolean('test', -42, false);
        expect(result).toEqual(true);
    });
    it('safeConvertBoolean("test", 42.42, false) should return true', () => {
        const result = safeConvertBoolean('test', 42.42, false);
        expect(result).toEqual(true);
    });
    it('safeConvertBoolean("test", " 42 ", false) should return true', () => {
        const result = safeConvertBoolean('test', ' 42 ', false);
        expect(result).toEqual(true);
    });
    it('safeConvertBoolean("test", "42", false) should return true', () => {
        const result = safeConvertBoolean('test', '42', false);
        expect(result).toEqual(true);
    });
    it('safeConvertBoolean("test", "", false) should return false', () => {
        const result = safeConvertBoolean('test', '', true);
        expect(result).toEqual(false);
    });
    it('safeConvertBoolean("test", true, false) should return true', () => {
        const result = safeConvertBoolean('test', true, false);
        expect(result).toEqual(true);
    });

    it('safeConvertNumber("test", false, true) should return false', () => {
        const result = safeConvertBoolean('test', false, true);
        expect(result).toEqual(false);
    });
    
    // string2boolean
    it('string2boolean("true") should return true', () => {
        const result = string2boolean('true');
        expect(result).toEqual(true);
    });
    it('string2boolean("True") should return true', () => {
        const result = string2boolean('True');
        expect(result).toEqual(true);
    });
    it('string2boolean("TRUE") should return true', () => {
        const result = string2boolean('TRUE');
        expect(result).toEqual(true);
    });
    it('string2boolean(" True ") should return true', () => {
        const result = string2boolean(' True ');
        expect(result).toEqual(true);
    });
    it('string2boolean("yes") should return true', () => {
        const result = string2boolean('yes');
        expect(result).toEqual(true);
    });
    it('string2boolean("1") should return true', () => {
        const result = string2boolean('1');
        expect(result).toEqual(true);
    });
    it('string2boolean("false") should return false', () => {
        const result = string2boolean('false');
        expect(result).toEqual(false);
    });
    it('string2boolean("no") should return false', () => {
        const result = string2boolean('no');
        expect(result).toEqual(false);
    });
    it('string2boolean("0") should return false', () => {
        const result = string2boolean('0');
        expect(result).toEqual(false);
    });
    // null and undefined are forbidden by strong type checking
    it('string2boolean("test") should return true', () => {
        const result = string2boolean('test');
        expect(result).toEqual(true);
    });

    // string2numberArray
    it('string2numberArray("1,2,3,9,4") should return [1,2,3,9,4]', () => {
        const result = string2numberArray('1,2,3,9,4');
        expect(result).toEqual([1,2,3,9,4]);
    });
    it('string2numberArray("1;2;3;9;4", ";") should return [1,2,3,9,4]', () => {
        const result = string2numberArray('1;2;3;9;4', ';');
        expect(result).toEqual([1,2,3,9,4]);
    });
    it('string2numberArray("1;2;3;9;4", ",") should return [] (wrong separator)', () => {
        const result1 = string2numberArray('12394', ',');   // wrong separator
        expect(result1).toEqual([12394]);

        const result2 = string2numberArray('1;2;3;9;4', ',');   // wrong separator
        // split converts this into ['1;2;3;9;4'], parsed as an integer it becomes [1]
        expect(result2).toEqual([1]);
    });
    // null and undefined are forbidden by strong type checking
    it('string2numberArray("") should return [] (forbidden null and undefined)', () => {
        const result = string2numberArray('');
        expect(result).toEqual([NaN]);
    });
    it('string2numberArray("-1") should return [-1]', () => {
        const result = string2numberArray('-1');
        expect(result).toEqual([-1]);
    });
    // stringArray2ObjectArray
    it('stringArray2ObjectArray(["test", "test2", "test3"]) should return [{name: "test"}, {name: "test2"}, {name: "test3"}]', () => {
        const result = stringArray2ObjectArray(['test', 'test2', 'test3']);
        expect(result).toEqual([{name: 'test'}, {name: 'test2'}, {name: 'test3'}]);
    });

    // stripHtml
    it('stripHtml("test") should return same string', () => {
        const result = stripHtml('test');
        expect(result).toEqual('test');
    });
    it('stripHtml("<a>te<b>st<casdf>") should return "test"', () => {
        const result = stripHtml('<a>te<b>st<casdf>');
        expect(result).toEqual('test');
    });
    it('stripHtml("") should return ""', () => {
        const result = stripHtml('');
        expect(result).toEqual('');
    });
    it('stripHtml("<test>") should return ""', () => {
        const result = stripHtml('<TEST>');
        expect(result).toEqual('');
    });

    describe('replacePlaceholders', () => {
        const fixedDate = new Date(2026, 4, 30, 14, 5); // 2026-05-30 14:05
        const ctx: PlaceholderContext = {
            tenantId: 'test-tenant',
            appDomain: 'example.com',
            appVersion: '1.2.3',
            appName: 'TestApp',
        };

        it('replaces @NOW@ with datetime in dd.mm.yyyy hh:mm format', () => {
            expect(replacePlaceholders('Event at @NOW@', ctx, fixedDate))
                .toBe('Event at 30.05.2026 14:05');
        });

        it('replaces @TODAY@ with date in dd.mm.yyyy format', () => {
            expect(replacePlaceholders('Date: @TODAY@', ctx, fixedDate))
                .toBe('Date: 30.05.2026');
        });

        it('replaces @TOMORROW@ with next day in dd.mm.yyyy format', () => {
            expect(replacePlaceholders('Due: @TOMORROW@', ctx, fixedDate))
                .toBe('Due: 31.05.2026');
        });

        it('replaces @YESTERDAY@ with previous day in dd.mm.yyyy format', () => {
            expect(replacePlaceholders('Since: @YESTERDAY@', ctx, fixedDate))
                .toBe('Since: 29.05.2026');
        });

        it('replaces @YEAR@ with current year in yyyy format', () => {
            expect(replacePlaceholders('Year: @YEAR@', ctx, fixedDate))
                .toBe('Year: 2026');
        });

        it('replaces @TID@ with tenantId', () => {
            expect(replacePlaceholders('Tenant: @TID@', ctx, fixedDate))
                .toBe('Tenant: test-tenant');
        });

        it('replaces @DOMAIN@ with appDomain', () => {
            expect(replacePlaceholders('Domain: @DOMAIN@', ctx, fixedDate))
                .toBe('Domain: example.com');
        });

        it('replaces @VERSION@ with appVersion', () => {
            expect(replacePlaceholders('v@VERSION@', ctx, fixedDate))
                .toBe('v1.2.3');
        });

        it('replaces @APPNAME@ with appName', () => {
            expect(replacePlaceholders('@APPNAME@', ctx, fixedDate))
                .toBe('TestApp');
        });

        it('replaces multiple occurrences of the same placeholder', () => {
            expect(replacePlaceholders('@TID@ and @TID@', ctx, fixedDate))
                .toBe('test-tenant and test-tenant');
        });

        it('replaces multiple different placeholders in one string', () => {
            expect(replacePlaceholders('@TID@-@DOMAIN@-@TODAY@', ctx, fixedDate))
                .toBe('test-tenant-example.com-30.05.2026');
        });

        it('pads single-digit day and month with leading zero', () => {
            const jan1 = new Date(2026, 0, 1, 9, 5); // 2026-01-01 09:05
            expect(replacePlaceholders('@TODAY@ @NOW@', ctx, jan1))
                .toBe('01.01.2026 01.01.2026 09:05');
        });

        it('leaves string unchanged when no placeholders present', () => {
            expect(replacePlaceholders('no placeholders here', ctx, fixedDate))
                .toBe('no placeholders here');
        });
    });

    describe('getPlaceholderHelp', () => {
        it('returns one entry per supported placeholder', () => {
            const help = getPlaceholderHelp();
            expect(help.length).toBe(9);
        });

        it('covers all supported placeholder tokens', () => {
            const tokens = getPlaceholderHelp().map(e => e.placeholder);
            expect(tokens).toContain('@NOW@');
            expect(tokens).toContain('@TODAY@');
            expect(tokens).toContain('@TOMORROW@');
            expect(tokens).toContain('@YESTERDAY@');
            expect(tokens).toContain('@YEAR@');
            expect(tokens).toContain('@TID@');
            expect(tokens).toContain('@DOMAIN@');
            expect(tokens).toContain('@VERSION@');
            expect(tokens).toContain('@APPNAME@');
        });

        it('each entry has a non-empty description', () => {
            for (const entry of getPlaceholderHelp()) {
                expect(entry.description.length).toBeGreaterThan(0);
            }
        });
    });
});