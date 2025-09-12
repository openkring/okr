import {
    BaseProperty,
    BkModel,
    MembershipModel,
    MetaTag,
    OrgModel,
    PersonalRelModel,
    PersonModel,
    ResourceModel
} from '@bk2/shared-models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as logUtil from './log.util';
import {
    arrayMove,
    checkForNumber,
    checkForString,
    compareName,
    compareNumbers,
    compareObjects,
    compareWords,
    extractFirstPartOfOptionalTupel,
    extractSecondPartOfOptionalTupel,
    extractTagAndDate,
    getIndexOfKey,
    // MetaTag functions
    getIndexOfMetaTag,
    getIndexOfValue,
    getModelAndKey,
    getNextChar,
    getNextString,
    // Tuple functions
    getPartsOfTupel,
    getProperties,
    // Property functions
    getProperty,
    getPropertyValue,
    getZipCodeNumber,
    hasProperty,
    isArray,
    isArrayOfStrings,
    isBoolean,
    isDate,
    isFunction,
    isInteger,
    isMembership,
    isNegativeInteger,
    isNonEmptyArray,
    isNonEmptyArrayOfStrings,
    isNonEmptyString,
    isNonNegativeInteger,
    isNull,
    isNumber,
    isObject,
    isOrg,
    // Type checks
    isPerson,
    isPersonalRel,
    isPositiveInteger,
    isResource,
    isString,
    isUndefined,
    isValidNumber,
    mapMove,
    // Comparison functions
    nameMatches,
    numberMatches,
    // Utility functions
    removeDuplicatesFromArray,
    removeKeyFromBkModel,
    removeProperty,
    removeUndefinedFields,
    replaceEndingSlash,
    replaceSubstring,
    setProperty,
    // Sorting functions
    SortOrder,
    validateNumberRange,
    zipCodeMatches
} from './type.util';

// Mock the log.util module
vi.mock('./log.util', () => ({
  die: vi.fn(),
  warn: vi.fn()
}));

describe('type.util', () => {
  const mockDie = vi.mocked(logUtil.die);
  const mockWarn = vi.mocked(logUtil.warn);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tuple functions', () => {
    describe('getPartsOfTupel', () => {
      it('should split a tuple with default separator', () => {
        const result = getPartsOfTupel('part1.part2');
        expect(result).toEqual(['part1', 'part2']);
      });

      it('should split a tuple with custom separator', () => {
        const result = getPartsOfTupel('user@domain.com', '@');
        expect(result).toEqual(['user', 'domain.com']);
      });

      it('should handle empty parts', () => {
        const result = getPartsOfTupel('.part2');
        expect(result).toEqual(['', 'part2']);
      });

      it('should call die for invalid tuples with too many parts', () => {
        mockDie.mockImplementation(() => { throw new Error('die called'); });
        
        expect(() => getPartsOfTupel('part1.part2.part3')).toThrow('die called');
        expect(mockDie).toHaveBeenCalledWith('TypeUtil.getPartsOfTupel: invalid tupel <part1.part2.part3> (must have format part.part).');
      });

      it('should call die for invalid tuples with no separator', () => {
        mockDie.mockImplementation(() => { throw new Error('die called'); });
        
        expect(() => getPartsOfTupel('noSeparator')).toThrow('die called');
        expect(mockDie).toHaveBeenCalledWith('TypeUtil.getPartsOfTupel: invalid tupel <noSeparator> (must have format part.part).');
      });

      it('should handle special characters in parts', () => {
        const result = getPartsOfTupel('special!@#.$%^&*()');
        expect(result).toEqual(['special!@#', '$%^&*()']);
      });
    });

    describe('getModelAndKey', () => {
      it('should convert first part to ModelType and return key', () => {
        const result = getModelAndKey('123.userKey');
        expect(result).toEqual([123, 'userKey']);
      });

      it('should handle numeric strings as ModelType', () => {
        const result = getModelAndKey('0.testKey');
        expect(result).toEqual([0, 'testKey']);
      });
    });

    describe('extractFirstPartOfOptionalTupel', () => {
      it('should return first part when separator exists', () => {
        const result = extractFirstPartOfOptionalTupel('first.second');
        expect(result).toBe('first');
      });

      it('should return full string when no separator', () => {
        const result = extractFirstPartOfOptionalTupel('noseparator');
        expect(result).toBe('noseparator');
      });

      it('should work with custom separator', () => {
        const result = extractFirstPartOfOptionalTupel('user@domain', '@');
        expect(result).toBe('user');
      });
    });

    describe('extractSecondPartOfOptionalTupel', () => {
      it('should return second part when separator exists', () => {
        const result = extractSecondPartOfOptionalTupel('first.second');
        expect(result).toBe('second');
      });

      it('should return full string when no separator', () => {
        const result = extractSecondPartOfOptionalTupel('noseparator');
        expect(result).toBe('noseparator');
      });

      it('should work with custom separator', () => {
        const result = extractSecondPartOfOptionalTupel('user@domain', '@');
        expect(result).toBe('domain');
      });
    });

    describe('extractTagAndDate', () => {
      it('should extract tags, date, and name from composite string', () => {
        const result = extractTagAndDate('project name :tag1 //2024-01-01');
        expect(result).toEqual(['tag1', '2024-01-01', 'project name']);
      });

      it('should handle multiple words in name', () => {
        const result = extractTagAndDate('this is a long project name :important //2024-12-31');
        expect(result).toEqual(['important', '2024-12-31', 'this is a long project name']);
      });

      it('should handle missing tags and date', () => {
        const result = extractTagAndDate('simple project name');
        expect(result).toEqual(['', '', 'simple project name']);
      });

      it('should handle only tags', () => {
        const result = extractTagAndDate('project :urgent');
        expect(result).toEqual(['urgent', '', 'project']);
      });

      it('should handle only date', () => {
        const result = extractTagAndDate('project //2024-05-15');
        expect(result).toEqual(['', '2024-05-15', 'project']);
      });
    });
  });

  describe('Property functions', () => {
    describe('getProperty', () => {
      it('should get property value with type safety', () => {
        const obj = { foo: 10, bar: 'hello' };
        const foo = getProperty(obj, 'foo');
        const bar = getProperty(obj, 'bar');
        
        expect(foo).toBe(10);
        expect(bar).toBe('hello');
      });

      it('should work with nested objects', () => {
        const obj = { user: { name: 'John', age: 30 } };
        const user = getProperty(obj, 'user');
        
        expect(user).toEqual({ name: 'John', age: 30 });
      });
    });

    describe('getProperties', () => {
      it('should return object keys as string array', () => {
        const obj = { name: 'test', age: 25, active: true };
        const keys = getProperties(obj);
        
        expect(keys).toEqual(['name', 'age', 'active']);
      });

      it('should handle empty object', () => {
        const keys = getProperties({});
        expect(keys).toEqual([]);
      });
    });

    describe('hasProperty', () => {
      it('should return true for existing properties', () => {
        const obj = { name: 'test', value: null };
        
        expect(hasProperty(obj, 'name')).toBe(true);
        expect(hasProperty(obj, 'value')).toBe(true);
      });

      it('should return false for non-existing properties', () => {
        const obj = { name: 'test' };
        
        expect(hasProperty(obj, 'missing')).toBe(false);
      });
    });

    describe('removeProperty', () => {
      it('should remove property and return new object', () => {
        const obj = { name: 'test', age: 25, city: 'NYC' };
        const result = removeProperty(obj, 'age');
        
        expect(result).toEqual({ name: 'test', city: 'NYC' });
        expect(obj).toEqual({ name: 'test', age: 25, city: 'NYC' }); // Original unchanged
      });

      it('should handle removing non-existent property', () => {
        const obj = { name: 'test' };
        const result = removeProperty(obj, 'missing');
        
        expect(result).toEqual({ name: 'test' });
      });
    });

    describe('removeKeyFromBkModel', () => {
      it('should remove bkey property from BkModel', () => {
        const model = { bkey: 'test-key', name: 'Test Model', value: 123 } as unknown as BkModel;
        const result = removeKeyFromBkModel(model);
        
        expect(result).toEqual({ name: 'Test Model', value: 123 });
        expect(result).not.toHaveProperty('bkey');
      });
    });

    describe('setProperty', () => {
      it('should set property value with type safety', () => {
        const obj = { name: 'original', count: 0 };
        
        setProperty(obj, 'name', 'updated');
        setProperty(obj, 'count', 5);
        
        expect(obj.name).toBe('updated');
        expect(obj.count).toBe(5);
      });
    });

    describe('getIndexOfValue', () => {
      const propertyList: BaseProperty[] = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: 'value1' }
      ];

      it('should return index of first occurrence', () => {
        expect(getIndexOfValue(propertyList, 'value1')).toBe(0);
        expect(getIndexOfValue(propertyList, 'value2')).toBe(1);
      });

      it('should return -1 for non-existent value', () => {
        expect(getIndexOfValue(propertyList, 'missing')).toBe(-1);
      });
    });

    describe('getIndexOfKey', () => {
      const propertyList: BaseProperty[] = [
        { key: 'name', value: 'John' },
        { key: 'age', value: '30' },
        { key: 'city', value: 'NYC' }
      ];

      it('should return index of key', () => {
        expect(getIndexOfKey(propertyList, 'name')).toBe(0);
        expect(getIndexOfKey(propertyList, 'age')).toBe(1);
        expect(getIndexOfKey(propertyList, 'city')).toBe(2);
      });

      it('should return -1 for non-existent key', () => {
        expect(getIndexOfKey(propertyList, 'missing')).toBe(-1);
      });
    });

    describe('getPropertyValue', () => {
      const propertyList: BaseProperty[] = [
        { key: 'name', value: 'John' },
        { key: 'age', value: 30 },
        { key: 'active', value: true }
      ];

      it('should return property value for existing key', () => {
        expect(getPropertyValue(propertyList, 'name')).toBe('John');
        expect(getPropertyValue(propertyList, 'age')).toBe(30);
        expect(getPropertyValue(propertyList, 'active')).toBe(true);
      });

      it('should return default value for missing key', () => {
        expect(getPropertyValue(propertyList, 'missing')).toBe('');
        expect(getPropertyValue(propertyList, 'missing', 'default')).toBe('default');
        
        expect(mockWarn).toHaveBeenCalledWith('TypeUtil.getPropertyValue: missing property, returning defaultValue <default>.');
      });

      it('should return default value for undefined property list', () => {
        expect(getPropertyValue(undefined, 'any')).toBe('');
        expect(getPropertyValue(undefined, 'any', 'fallback')).toBe('fallback');
        
        expect(mockWarn).toHaveBeenCalledWith('TypeUtil.getPropertyValue: missing propertyList, returning defaultValue <fallback>.');
      });
    });
  });

  describe('MetaTag functions', () => {
    describe('getIndexOfMetaTag', () => {
      const metaTagList: MetaTag[] = [
        { name: 'tag1', content: 'value1' },
        { name: 'tag2', content: 'value2' },
        { name: 'tag3', content: 'value3' }
      ];

      it('should return index of meta tag name', () => {
        expect(getIndexOfMetaTag(metaTagList, 'tag1')).toBe(0);
        expect(getIndexOfMetaTag(metaTagList, 'tag2')).toBe(1);
        expect(getIndexOfMetaTag(metaTagList, 'tag3')).toBe(2);
      });

      it('should return -1 for non-existent tag', () => {
        expect(getIndexOfMetaTag(metaTagList, 'missing')).toBe(-1);
      });
    });
  });

  describe('Comparison functions', () => {
    describe('nameMatches', () => {
      it('should return true for empty or null search terms', () => {
        expect(nameMatches('John Doe', '')).toBe(true);
        expect(nameMatches('John Doe', null)).toBe(true);
        expect(nameMatches('John Doe', undefined)).toBe(true);
        expect(nameMatches('John Doe', 'all')).toBe(true);
      });

      it('should return true for matching names', () => {
        expect(nameMatches('John Doe', 'john')).toBe(true);
        expect(nameMatches('John Doe', 'doe')).toBe(true);
        expect(nameMatches('John Doe', 'John')).toBe(true);
      });

      it('should return false for non-matching names', () => {
        expect(nameMatches('John Doe', 'smith')).toBe(false);
        expect(nameMatches('John Doe', 'jane')).toBe(false);
      });
    });

    describe('compareName', () => {
      it('should return true for case-insensitive matches', () => {
        expect(compareName('John Doe', 'john')).toBe(true);
        expect(compareName('JOHN DOE', 'doe')).toBe(true);
        expect(compareName('john doe', 'JOHN')).toBe(true);
      });

      it('should return false for non-matches', () => {
        expect(compareName('John Doe', 'smith')).toBe(false);
        expect(compareName('John Doe', 'jane')).toBe(false);
      });

      it('should handle empty or falsy values', () => {
        expect(compareName('', 'test')).toBe(false);
        expect(compareName('test', '')).toBe(false);
      });
    });

    describe('numberMatches', () => {
      it('should return true for matching numbers', () => {
        expect(numberMatches(123, 123)).toBe(true);
        expect(numberMatches(123, '123')).toBe(true);
      });

      it('should return false for non-matching numbers', () => {
        expect(numberMatches(123, 456)).toBe(false);
        expect(numberMatches(123, '456')).toBe(false);
      });

      it('should return true for undefined/null search terms', () => {
        expect(numberMatches(123, undefined)).toBe(true);
        expect(numberMatches(123, null)).toBe(true);
      });
    });

    describe('zipCodeMatches', () => {
      it('should return true for zip codes in range', () => {
        expect(zipCodeMatches(1234, 1)).toBe(true);
        expect(zipCodeMatches(1234, 12)).toBe(true);
        expect(zipCodeMatches(1234, 123)).toBe(true);
      });

      it('should return false for zip codes out of range', () => {
        expect(zipCodeMatches(1234, 2)).toBe(false);
        expect(zipCodeMatches(1234, 13)).toBe(false);
      });

      it('should return true for falsy search terms', () => {
        expect(zipCodeMatches(1234, 0)).toBe(true);
      });
    });

    describe('compareNumbers', () => {
      it('should return correct comparison results', () => {
        expect(compareNumbers(5, 3)).toBe(2);
        expect(compareNumbers(3, 5)).toBe(-2);
        expect(compareNumbers(5, 5)).toBe(0);
      });
    });

    describe('compareWords', () => {
      it('should return correct string comparison results', () => {
        expect(compareWords('apple', 'banana')).toBe(-1);
        expect(compareWords('banana', 'apple')).toBe(1);
        expect(compareWords('apple', 'apple')).toBe(0);
      });

      it('should be case insensitive', () => {
        expect(compareWords('Apple', 'apple')).toBe(0);
        expect(compareWords('BANANA', 'apple')).toBe(1);
      });
    });

    describe('compareObjects', () => {
      const data = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 }
      ];

      it('should sort objects by field name ascending', () => {
        const result = compareObjects([...data], 'name', true);
        expect(result.map(item => item.name)).toEqual(['Alice', 'Bob', 'Charlie']);
      });

      it('should sort objects by field name descending', () => {
        const result = compareObjects([...data], 'name', false);
        expect(result.map(item => item.name)).toEqual(['Charlie', 'Bob', 'Alice']);
      });

      it('should sort objects by numeric field', () => {
        const result = compareObjects([...data], 'age', true);
        expect(result.map(item => item.age)).toEqual([25, 30, 35]);
      });
    });

    describe('getZipCodeNumber', () => {
      it('should handle single digit numbers', () => {
        expect(getZipCodeNumber(5)).toBe(5000);
        expect(getZipCodeNumber(9)).toBe(9000);
      });

      it('should handle two digit numbers', () => {
        expect(getZipCodeNumber(12)).toBe(1200);
        expect(getZipCodeNumber(99)).toBe(9900);
      });

      it('should handle three digit numbers', () => {
        expect(getZipCodeNumber(123)).toBe(1230);
        expect(getZipCodeNumber(999)).toBe(9990);
      });

      it('should handle four+ digit numbers', () => {
        expect(getZipCodeNumber(1234)).toBe(1234);
        expect(getZipCodeNumber(12345)).toBe(2345); // % 10000
      });
    });
  });

  describe('Type check functions', () => {
    const tenantId = 'test-tenant';

    describe('Model type guards', () => {
      it('should identify PersonModel', () => {
        const person = new PersonModel(tenantId);
        expect(isPerson(person, tenantId)).toBe(true);
        expect(isPerson({}, tenantId)).toBe(false);
        expect(isPerson(null, tenantId)).toBe(false);
      });

      it('should identify OrgModel', () => {
        const org = new OrgModel(tenantId);
        expect(isOrg(org, tenantId)).toBe(true);
        expect(isOrg({}, tenantId)).toBe(false);
      });

      it('should identify ResourceModel', () => {
        const resource = new ResourceModel(tenantId);
        expect(isResource(resource, tenantId)).toBe(true);
        expect(isResource({}, tenantId)).toBe(false);
      });

      it('should identify PersonalRelModel', () => {
        const personalRel = new PersonalRelModel(tenantId);
        expect(isPersonalRel(personalRel, tenantId)).toBe(true);
        expect(isPersonalRel({}, tenantId)).toBe(false);
      });

      it('should identify MembershipModel', () => {
        const membership = new MembershipModel(tenantId);
        expect(isMembership(membership, tenantId)).toBe(true);
        expect(isMembership({}, tenantId)).toBe(false);
      });
    });

    describe('Basic type guards', () => {
      it('should identify undefined', () => {
        expect(isUndefined(undefined)).toBe(true);
        expect(isUndefined(null)).toBe(false);
        expect(isUndefined('')).toBe(false);
        expect(isUndefined(0)).toBe(false);
      });

      it('should identify boolean', () => {
        expect(isBoolean(true)).toBe(true);
        expect(isBoolean(false)).toBe(true);
        expect(isBoolean(1)).toBe(false);
        expect(isBoolean('true')).toBe(false);
      });

      it('should identify number', () => {
        expect(isNumber(123)).toBe(true);
        expect(isNumber(0)).toBe(true);
        expect(isNumber(-5)).toBe(true);
        expect(isNumber(3.14)).toBe(true);
        expect(isNumber('123')).toBe(false);
      });

      it('should identify string', () => {
        expect(isString('hello')).toBe(true);
        expect(isString('')).toBe(true);
        expect(isString(123)).toBe(false);
        expect(isString(null)).toBe(false);
      });

      it('should identify valid numbers', () => {
        expect(isValidNumber(123)).toBe(true);
        expect(isValidNumber(0)).toBe(true);
        expect(isValidNumber(-5)).toBe(true);
        expect(isValidNumber(NaN)).toBe(false);
        expect(isValidNumber('123')).toBe(false);
      });

      it('should identify integers', () => {
        expect(isInteger(123)).toBe(true);
        expect(isInteger(0)).toBe(true);
        expect(isInteger(-5)).toBe(true);
        expect(isInteger(3.14)).toBe(false);
        expect(isInteger('123')).toBe(false);
      });

      it('should identify positive integers', () => {
        expect(isPositiveInteger(123)).toBe(true);
        expect(isPositiveInteger(1)).toBe(true);
        expect(isPositiveInteger(0)).toBe(false);
        expect(isPositiveInteger(-5)).toBe(false);
      });

      it('should identify non-negative integers', () => {
        expect(isNonNegativeInteger(123)).toBe(true);
        expect(isNonNegativeInteger(0)).toBe(true);
        expect(isNonNegativeInteger(-5)).toBe(false);
      });

      it('should identify negative integers', () => {
        expect(isNegativeInteger(-5)).toBe(true);
        expect(isNegativeInteger(-1)).toBe(true);
        expect(isNegativeInteger(0)).toBe(false);
        expect(isNegativeInteger(5)).toBe(false);
      });

      it('should identify arrays', () => {
        expect(isArray([])).toBe(true);
        expect(isArray([1, 2, 3])).toBe(true);
        expect(isArray('not array')).toBe(false);
        expect(isArray({})).toBe(false);
      });

      it('should identify non-empty arrays', () => {
        expect(isNonEmptyArray([1, 2, 3])).toBe(true);
        expect(isNonEmptyArray([])).toBe(false);
        expect(isNonEmptyArray('not array')).toBe(false);
      });

      it('should identify string arrays', () => {
        expect(isArrayOfStrings(['a', 'b', 'c'])).toBe(true);
        expect(isArrayOfStrings([])).toBe(true);
        expect(isArrayOfStrings([1, 2, 3])).toBe(false);
        expect(isArrayOfStrings(['a', 1])).toBe(false);
      });

      it('should identify non-empty string arrays', () => {
        expect(isNonEmptyArrayOfStrings(['a', 'b'])).toBe(true);
        expect(isNonEmptyArrayOfStrings([])).toBe(false);
        expect(isNonEmptyArrayOfStrings([1, 2])).toBe(false);
      });

      it('should identify non-empty strings', () => {
        expect(isNonEmptyString('hello')).toBe(true);
        expect(isNonEmptyString(' ')).toBe(true);
        expect(isNonEmptyString('')).toBe(false);
        expect(isNonEmptyString(123)).toBe(false);
      });

      it('should identify functions', () => {
        expect(isFunction(() => {})).toBe(true);
        expect(isFunction(function() {})).toBe(true);
        expect(isFunction('not function')).toBe(false);
      });

      it('should identify objects', () => {
        expect(isObject({})).toBe(true);
        expect(isObject({ a: 1 })).toBe(true);
        expect(isObject([])).toBe(true);
        expect(isObject(null)).toBe(false);
        expect(isObject('string')).toBe(false);
      });

      it('should identify dates', () => {
        expect(isDate(new Date())).toBe(true);
        expect(isDate('2024-01-01')).toBe(false);
        expect(isDate(1234567890)).toBe(false);
      });

      it('should identify null', () => {
        expect(isNull(null)).toBe(true);
        expect(isNull(undefined)).toBe(false);
        expect(isNull(0)).toBe(false);
        expect(isNull('')).toBe(false);
      });
    });

    describe('checkForString', () => {
      it('should return string or empty default', () => {
        expect(checkForString('hello')).toBe('hello');
        expect(checkForString(null)).toBe('');
        expect(checkForString(undefined)).toBe('');
      });
    });

    describe('checkForNumber', () => {
      it('should return number or zero default', () => {
        expect(checkForNumber(123)).toBe(123);
        expect(checkForNumber(null)).toBe(0);
        expect(checkForNumber(undefined)).toBe(0);
      });
    });

    describe('validateNumberRange', () => {
      it('should return true for numbers in range', () => {
        expect(validateNumberRange(5, 1, 10)).toBe(true);
        expect(validateNumberRange(1, 1, 10)).toBe(true);
        expect(validateNumberRange(10, 1, 10)).toBe(true);
      });

      it('should return false for numbers out of range', () => {
        expect(validateNumberRange(0, 1, 10)).toBe(false);
        expect(validateNumberRange(11, 1, 10)).toBe(false);
      });

      it('should call die for invalid values', () => {
        mockDie.mockImplementation(() => { throw new Error('die called'); });
        
        expect(() => validateNumberRange(null, 1, 10)).toThrow('die called');
        expect(() => validateNumberRange('not number', 1, 10)).toThrow('die called');
      });
    });
  });

  describe('Sorting and array manipulation', () => {
    describe('SortOrder enum', () => {
      it('should have correct values', () => {
        expect(SortOrder.Smaller).toBe(-1);
        expect(SortOrder.Equal).toBe(0);
        expect(SortOrder.Bigger).toBe(1);
      });
    });

    describe('arrayMove', () => {
      it('should move element within array bounds', () => {
        const arr = ['a', 'b', 'c', 'd'];
        arrayMove(arr, 1, 3);
        expect(arr).toEqual(['a', 'c', 'd', 'b']);
      });

      it('should handle moving to end of array', () => {
        const arr = ['a', 'b', 'c'];
        arrayMove(arr, 0, 2);
        expect(arr).toEqual(['b', 'c', 'a']);
      });

      it('should handle moving beyond array length', () => {
        const arr = ['a', 'b'];
        arrayMove(arr, 0, 5);
        expect(arr.length).toBeGreaterThan(2);
        expect(arr[5]).toBe('a');
      });
    });

    describe('mapMove', () => {
      it('should reorder map entries', () => {
        const map = new Map([
          ['first', 1],
          ['second', 2],
          ['third', 3]
        ]);
        
        const result = mapMove(map, 0, 2);
        const keys = Array.from(result.keys());
        
        expect(keys).toEqual(['second', 'third', 'first']);
      });
    });

    describe('getNextChar', () => {
      it('should return next character', () => {
        expect(getNextChar('a')).toBe('b');
        expect(getNextChar('z')).toBe('{');
        expect(getNextChar('A')).toBe('B');
      });

      it('should return null for invalid input', () => {
        expect(getNextChar('')).toBe(null);
        expect(getNextChar('ab')).toBe(null);
      });
    });

    describe('getNextString', () => {
      it('should return next string', () => {
        expect(getNextString('abc')).toBe('abd');
        expect(getNextString('test')).toBe('tesu');
      });

      it('should handle wrap around for z', () => {
        expect(getNextString('abz')).toBe('aba');
      });

      it('should return null for empty string', () => {
        expect(getNextString('')).toBe(null);
      });
    });

    describe('replaceSubstring', () => {
      it('should replace first occurrence', () => {
        expect(replaceSubstring('abcabc', 'a', 'x')).toBe('xbcabc');
        expect(replaceSubstring('Rainstr. 10', 'str.', 'strasse')).toBe('Rainstrasse 10');
      });

      it('should handle no match', () => {
        expect(replaceSubstring('abc', 'x', 'y')).toBe('abc');
      });
    });

    describe('replaceEndingSlash', () => {
      it('should remove trailing slash', () => {
        expect(replaceEndingSlash('https://example.com/')).toBe('https://example.com');
        expect(replaceEndingSlash('path/to/file/')).toBe('path/to/file');
      });

      it('should leave URLs without trailing slash unchanged', () => {
        expect(replaceEndingSlash('https://example.com')).toBe('https://example.com');
        expect(replaceEndingSlash('path/to/file')).toBe('path/to/file');
      });
    });
  });

  describe('Utility functions', () => {
    describe('removeDuplicatesFromArray', () => {
      it('should remove duplicates based on property', () => {
        const array = [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
          { id: 1, name: 'John Duplicate' },
          { id: 3, name: 'Bob' }
        ];
        
        const result = removeDuplicatesFromArray(array, 'id');
        
        expect(result).toHaveLength(3);
        expect(result.map(item => item.id)).toEqual([1, 2, 3]);
        expect(result[0].name).toBe('John'); // First occurrence kept
      });

      it('should handle empty array', () => {
        expect(removeDuplicatesFromArray([], 'id')).toEqual([]);
      });
    });

    describe('removeUndefinedFields', () => {
      it('should remove undefined fields', () => {
        const obj = {
          name: 'John',
          age: undefined,
          city: 'NYC',
          country: undefined,
          active: true
        };
        
        const result = removeUndefinedFields(obj);
        
        expect(result).toEqual({
          name: 'John',
          city: 'NYC',
          active: true
        });
      });

      it('should keep null and false values', () => {
        const obj = {
          name: null,
          active: false,
          count: 0,
          missing: undefined
        };
        
        const result = removeUndefinedFields(obj);
        
        expect(result).toEqual({
          name: null,
          active: false,
          count: 0
        });
      });
    });
  });

  describe('Edge cases and integration', () => {
    it('should handle complex object manipulations', () => {
      const data = [
        { id: 1, name: 'John', tags: undefined },
        { id: 2, name: 'Jane', tags: 'important' },
        { id: 1, name: 'John Duplicate', tags: 'urgent' }
      ];
      
      // Remove duplicates and undefined fields
      const deduplicated = removeDuplicatesFromArray(data, 'id');
      const cleaned = deduplicated.map(item => removeUndefinedFields(item));
      
      expect(cleaned).toHaveLength(2);
      expect(cleaned[0]).toEqual({ id: 1, name: 'John' });
      expect(cleaned[1]).toEqual({ id: 2, name: 'Jane', tags: 'important' });
    });

    it('should demonstrate type checking workflow', () => {
      const mixedData = [
        'string',
        123,
        true,
        null,
        undefined,
        ['array'],
        { object: true },
        new Date()
      ];
      
      const strings = mixedData.filter(isString);
      const numbers = mixedData.filter(isNumber);
      const booleans = mixedData.filter(isBoolean);
      const arrays = mixedData.filter(isArray);
      const objects = mixedData.filter(isObject);
      
      expect(strings).toEqual(['string']);
      expect(numbers).toEqual([123]);
      expect(booleans).toEqual([true]);
      expect(arrays).toHaveLength(1);
      expect(objects).toHaveLength(3); // array, object, date
    });
  });
});