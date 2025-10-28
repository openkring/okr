import { BaseProperty, BaseType, BkModel, MembershipModel, MetaTag, ModelType, OrgModel, PersistedModel, PersonalRelModel, PersonModel, ResourceModel, RoleEnum } from '@bk2/shared-models';
import { die, warn } from './log.util';

/************************************************* Tupel ********************************************************** */
/**
 * Takes a string that consists of two parts (i.e. a tupel) that are combined with a separator (e.g. . or @) and returns a tuple with the two parts.
 * This can be used e.g. for  ModelType.Key, filename.extension, 2022@p13, test@test.com, company.com  etc.
 * @param tupel the string in the format part.part
 * @returns  a tuple with both parts in order of appearance
 */
export function getPartsOfTupel(tupel: string, separator = '.'): [string, string] {
  const parts = tupel.split(separator);
  if (parts.length !== 2) die('TypeUtil.getPartsOfTupel: invalid tupel <' + tupel + '> (must have format part' + separator + 'part).');
  return [parts[0], parts[1]];
}

// converts the first part to the ModelType.
export function getModelAndKey(tupel: string): [ModelType, string] {
  const [modelType, modelKey] = getPartsOfTupel(tupel);
  return [parseInt(modelType) as ModelType, modelKey];
}

export function extractFirstPartOfOptionalTupel(composite: string, separator = '.'): string {
  if (composite.indexOf(separator) === -1) return composite;
  return getPartsOfTupel(composite, separator)[0];
}

/**
 * Takes a string that optionally contains a separator (e.g. . or @).
 * Returns the full string if no separator is present.
 * Otherwise, it returns the second part of the string.
 * @param composite 
 * @param separator 
 * @returns 
 */
export function extractSecondPartOfOptionalTupel(composite: string, separator = '.'): string {
  if (composite.indexOf(separator) === -1) return composite;
  return getPartsOfTupel(composite, separator)[1];
}

export function extractTagAndDate(composite: string): [string, string, string] {
  let tags = '';
  let date = '';
  let name = '';
  const words = composite.split(' ');
  for(const word of words) {
    if (word.startsWith(':')) {
      tags = word.substring(1);
    } else if (word.startsWith('//')) {
      date = word.substring(2);
    } else {
      name = name + ' ' + word;
    }
  }
  return [tags, date, name.trim()];
}

/************************************************* Property ********************************************************** */
/**
 * type-safe lookup of an object property.
 * use like this:
 * let x = { foo: 10, bar: "hello" };
 * let foo = getProperty(x, 'foo'); / number
 * let oops = getProperty(x, 'blabla'); // Error! 'blabla' is not 'foo' | 'bar'
 * 
 * @param obj the object
 * @param key the name of the property to look up
 */
export function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]; // Inferred type is T[K]
}

export function getProperties<T extends object>(obj: T): string[] {
  return Object.keys(obj)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasProperty(obj: any, key: string): boolean {
  return key in obj;
}

/**
 * Removes an attribute from an object.
 * There are two possible approaches 
 * 1) delete obj[key]  -> this mutates the object
 * 2) Object.entries(obj).filter(([key]) => ...) -> guarantees object immutability. It creates a new object without modifying the original one.
 * @param obj 
 * @param key 
 */
export function removeProperty(obj: object, key: string): object {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
  // or const copy = structuredClone(obj); delete copy[key]; return copy;
}

export function removeKeyFromBkModel(model: BkModel): PersistedModel {
  return removeProperty(model, 'bkey') as PersistedModel;
}

/**
 * Type-safe setting of an object property.
 * use like this:
 * setProperty(x, 'foo', 'string'); // Error!, string expected number
 * @param obj the object
 * @param key the name of the property to set
 * @param value the value of the property to set
 */
export function setProperty<T, K extends keyof T>(obj: T, key: K, value: T[K]) {
  obj[key] = value;
}

/**
 * Returns the index of the first occurrence of a value in an BaseProperty array, or -1 if it is not present.
 * @param propertyList the BaseProperty array to search in
 * @param value the value to search for
 * @returns the index of the given value, or -1 if it is not present
 */
export function getIndexOfValue(propertyList: BaseProperty[], value: string): number {
  for (let i = 0; i < propertyList.length; i++) {
    if (propertyList[i].value === value) return i;
  }
  return -1;
}

export function getPropertyValue(propertyList: BaseProperty[] | undefined, key: string, defaultValue = ''): BaseType {
  if (!propertyList) {
    warn('TypeUtil.getPropertyValue: missing propertyList, returning defaultValue <' + defaultValue + '>.');
    return defaultValue;
  } else {
    const index = getIndexOfKey(propertyList, key);
    if (index === -1) {
      warn('TypeUtil.getPropertyValue: missing property, returning defaultValue <' + defaultValue + '>.');
      return defaultValue;  
    } else {
      return propertyList[index].value;
    }
  }
}

/**
 * Returns the index of the first occurrence of a key in an BaseProperty array, or -1 if it is not present.
 * @param propertyList the BaseProperty array to search in
 * @param key the key to search for
 * @returns the index of the given key, or -1 if it is not present
 */
export function getIndexOfKey(propertyList: BaseProperty[], key: string): number {
  for (let i = 0; i < propertyList.length; i++) {
    if (propertyList[i].key === key) return i;
  }
  return -1;
}


/************************************************* MetaTag ********************************************************** */

/**
 * Returns the index of the first occurrence of a name in an MetaList array, or -1 if it is not present.
 * @param metaTagList the MetaTag array to search in
 * @param name the name to search for
 * @returns the index of the given name, or -1 if it is not present
 */
export function getIndexOfMetaTag(metaTagList: MetaTag[], name: string): number {
  for (let i = 0; i < metaTagList.length; i++) {
    if (metaTagList[i].name === name) return i;
  }
  return -1;
}

/************************************************* Comparison ********************************************************** */
/**
 * This method can be used in filters.
 * It returns true if the searchTerm is either empty or matches the nameProperty.
 * @param nameProperty 
 * @param searchTerm 
 */
export function nameMatches(nameProperty: string, searchTerm: string | null | undefined): boolean {
  if (!searchTerm || searchTerm.length === 0 || searchTerm === 'all') return true;
  return compareName(nameProperty, searchTerm);
}

export function compareName(name1: string, name2: string): boolean {
  return name1 && name2 ? name1.toLowerCase().indexOf(name2.toLowerCase()) > -1 : false;
}

export function numberMatches(numberProperty: number, searchTerm: string | number | null | undefined): boolean {
  if (searchTerm === undefined || searchTerm === null) return true;
  const searchNumber = parseInt(searchTerm + '');
  return compareNumbers(numberProperty, searchNumber) === 0;
}

export function zipCodeMatches(zipCode: number, searchTerm: number): boolean {
  if (!searchTerm) return true;
  return (zipCode >= getZipCodeNumber(searchTerm) && zipCode < getZipCodeNumber(searchTerm + 1));
}

export function compareNumbers(a: number, b: number): number {
  return a - b;
}

export function compareWords(a: string, b: string): number {
  const nameA = a.toUpperCase(); 
  const nameB = b.toUpperCase();
  if (nameA < nameB) return -1;
  if (nameA > nameB) return 1;
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compareObjects(data: any[], fieldName: string, isAscending = true) {
  return data.sort((a, b) => {
      return a[fieldName].toString().localeCompare(b[fieldName]) * (isAscending ? 1 : -1)
  });
}

export function getZipCodeNumber(searchTerm: number): number {
  if (searchTerm < 10) return searchTerm * 1000;
  if (searchTerm < 100) return searchTerm * 100;
  if (searchTerm < 1000) return searchTerm * 10;
  return searchTerm % 10000;
}
/************************************************* Model Type Checks ********************************************************** */
export function isPerson(person: unknown, tenantId: string): person is PersonModel {
  if(isType<PersonModel>(person, new PersonModel(tenantId))) {
    if (person.tenants) {
      return person.tenants.includes(tenantId);
    }
  }
  return false;
}

export function isOrg(org: unknown, tenantId: string): org is OrgModel {
  if(isType<OrgModel>(org, new OrgModel(tenantId))) {
    if (org.tenants) {
      return org.tenants.includes(tenantId);
    }
  }
  return false;
}

export function isResource(resource: unknown, tenantId: string): resource is ResourceModel {
  if(isType<ResourceModel>(resource, new ResourceModel(tenantId))) {
    if (resource.tenants) {
      return resource.tenants.includes(tenantId);
    }
  }
  return false;
}

export function isPersonalRel(personalRel: unknown, tenantId: string): personalRel is PersonalRelModel {
  if(isType<PersonalRelModel>(personalRel, new PersonalRelModel(tenantId))) {
    if (personalRel.tenants) {
      return personalRel.tenants.includes(tenantId);
    }
  }
  return false;
}

export function isMembership(membership: unknown, tenantId: string): membership is MembershipModel {
  if(isType<MembershipModel>(membership, new MembershipModel(tenantId))) {
    if (membership.tenants) {
      return membership.tenants.includes(tenantId);
    }
  }
  return false;
}

export function isRole(role: unknown): role is RoleEnum {
  return (isType<typeof RoleEnum>(role, RoleEnum));
}

/************************************************* General Type Checks ********************************************************** */
/**
 * Generic type guard for simple objects (does not work with Arrays).
 * usage: if (isType(data, BaseModel))
 * @param unknownVar the data to check the type for
 * @param expectedType the type the object is expected to have
 */
export function isType<T>(unknownVar: unknown, expectedType: T): unknownVar is T {
  if (!unknownVar) return false;
  return typeof unknownVar === typeof expectedType;
}

// the following type guards are from: https://github.com/hqoss
// changed from const to functions
export function isUndefined<T>(term: T | undefined): term is undefined {
  return typeof term === 'undefined';
}

export function isBoolean<U>(term: boolean | U): term is boolean {
  return typeof term === 'boolean';
}

export function isNumber<U>(term: number | U): term is number {
  return typeof term === 'number';
}

export function isString<U>(term: string | U): term is string {
  return typeof term === 'string';
}

export function checkForString(field: string | null | undefined): string {
  //  return (field === null || field === undefined) ? '' : field;
  return field ?? '';
}

export function checkForNumber(field: number | null | undefined): number {
  // return (field === null || field === undefined) ? 0 : field;
  return field ?? 0;
} 

export function isBaseType<U>(term: BaseType | U): term is BaseType {
  return isString(term) || isNumber(term) || isBoolean(term);
}

export function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

export function isArrayOfBaseProperties(value: unknown): value is BaseProperty[] {
  return Array.isArray(value) && value.every(item => isBaseType(item));
}

export function isNonEmptyArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string");
}

export function isNonEmptyArray<T, U>(term: Array<T> | U): term is Array<T> {
  return isArray(term) && term.length > 0;
}

export function isNonEmptyString<U>(term: string | U): term is string {
  return isString(term) && term.length > 0;
}

export function isValidNumber<U>(term: number | U): term is number {
  return isNumber(term) && !Number.isNaN(term);
}

export function isInteger<U>(term: number | U): term is number {
  return isValidNumber(term) && Number.isInteger(term);
}

export function isPositiveInteger<U>(term: number | U): term is number {
  return isInteger(term) && term > 0;
}

export function isNonNegativeInteger<U>(term: number | U): term is number {
  return isInteger(term) && term >= 0;
}

export function isNegativeInteger<U>(term: number | U): term is number {
  return isInteger(term) && term < 0;
}

export function isNull<T>(term: T | null): term is null {
  return term === null;
}

// narrow HTMLElement to HTMLINputElement
// source: https://stackoverflow.com/questions/48488701/type-null-is-not-assignable-to-type-htmlinputelement-reactjs
export function isInputElement(elem: HTMLElement | null): elem is HTMLInputElement {
  return !elem ? false : elem?.tagName === 'INPUT';
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function isFunction<T extends Function, U>(term: T | U): term is T {
  return typeof term === 'function';
}

export function isObject<T extends object, U>(
  term: T | U,
): term is NonNullable<T> {
  return !isNull(term) && typeof term === 'object';
}

export function isArray<T, U>(term: Array<T> | U): term is Array<T> {
  return Array.isArray(term);
}

export function isDate<U>(term: Date | U): term is Date {
  return term instanceof Date;
}

// custom checkers
export function isObjectWithId<T>(obj: T): obj is T {
  return isObject(obj) && hasProperty(obj, 'id');
}

export function isObjectWithKeyAndName<T>(obj: T): obj is T {
  return isObject(obj) && hasProperty(obj, 'bkey') && hasProperty(obj, 'name');
}

export function validateNumberRange(value: unknown, min: number, max: number): boolean {
  if (!value) die('validateNumberRange: invalid value');
  if (typeof value !== 'number') die('validateNumberRange: value must be a number');
  return value >= min && value <= max;
}

// optional type
// use like this: let user: Optional<User>;
export type Optional<T> = T | undefined;


/************************************************* Sorting / Ordering ********************************************************** */

export enum SortOrder {
  Smaller = -1,
  Equal = 0,
  Bigger = 1
}

/**
 * Moves an element of an array from its current position (fromIndex) to a different position (toIndex).
 * splice performs operations on the array in-place, so the data contains the new ordering.
 * @param data the array to work on
 * @param fromIndex the position of the element to move
 * @param toIndex  the new position the element should be moved to
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function arrayMove(data: any[], fromIndex: number, toIndex: number): void {
  if (toIndex >= data.length) {
      let k = toIndex - data.length + 1;
      while (k--) {
          data.push(undefined);
      }
  }
  data.splice(toIndex, 0, data.splice(fromIndex, 1)[0]);
}

export function mapMove(propertyList: Map<string, BaseType>, fromIndex: number, toIndex: number): Map<string, BaseType> {
  const keys = Array.from(propertyList.keys());
  arrayMove(keys, fromIndex, toIndex); // an array with the newly ordered keys
  const propertyList2 = new Map<string, BaseType>();
  for (const element of keys) {
    const value = propertyList.get(element);
    if (value !== undefined) propertyList2.set(element, value);
  }
  propertyList.clear();
  return propertyList2;
}

export function getNextChar(char: string): string | null {
  if (char.length !== 1) return null; // ensure the input is a single character
  const charCode = char.charCodeAt(0);
  return String.fromCharCode(charCode + 1);
}

/**
 * Returns the next string of a given string of arbitrary length.
 * This can be used to query for incomplete strings in a Firestore database.
 * e.g. where('name', '>=', 'abc' and where('name', '<', getNextString('abc'))
 * @param str the given string
 * @returns the next string, e.g. 'abc' -> 'abd'
 * 
 * TBD: check and handle Umlaute !
 */
export function getNextString(str: string): string | null {
  const lastIndex = str.length - 1;
  const lastChar = str.charAt(lastIndex); // get the last character
  const nextChar = getNextChar(lastChar);
  if (!nextChar) return null;
  if (nextChar > 'z') { // if the next character is 'z', wrap arount to 'a'
    return str.substring(0, lastIndex) + 'a';
  } else {    // otherwise, replace the last character with the next character
    return str.substring(0, lastIndex) + nextChar;
  }
}

/**
  * Replaces the first occurrence of a substring in a string with a new substring.
  * @param sourceString the string to search in
  * @param patternStr the substring to search for
  * @param replacementStr the substring to replace the pattern with
  * @returns the modified string; the sourceString is not changed.
  * example: replaceSubstring('abcabc', 'a', 'x') -> 'xbcabc'
  * example: replaceSubstring('Rainstr. 10', 'str.', 'strasse') -> 'Rainstrasse 10'
  */
export function replaceSubstring(sourceString: string, patternStr: string, replacementStr: string): string {
  return sourceString.replace(patternStr, replacementStr);
}

export function replaceEndingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/************************************************* Duplicates ********************************************************** */

/**
 * Removes duplicates from an array of objects based on a specific property.
 * credit: https://stackoverflow.com/a/36744732/6513921 and https://stackoverflow.com/questions/64854928/angular-remove-duplicates-in-an-observable
 * @param target the array of objects to filter
 * @param property the property to check for duplicates
 * @returns a new array with duplicates removed
 */
export function removeDuplicatesFromArray<T>(target: Array<T>, property: keyof T): Array<T> {
  return target.filter((item, index) =>
    index === target.findIndex(t => 
      t[property] === item[property]
    )
  );
}


/**
 * Firestore does not allow undefined values in the data and returns an error.
 * FirebaseError: Function updateDoc() called with invalid data. Unsupported field value: undefined
 * In order to avoid this error, we need to remove all undefined values from the object before updating it.
 * Use like this:
 * const updateData = removeUndefinedFields(data);
 * await updateDoc(docRef, updateData);
 * @param obj 
 * @returns 
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function removeUndefinedFields(obj: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Object.fromEntries(Object.entries(obj).filter(([_, value]) => value !== undefined));
}