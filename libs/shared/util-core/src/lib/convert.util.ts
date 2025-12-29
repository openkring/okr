import { AccountModel, AvatarInfo, GroupModel, NameDisplay, NamedModel, OrgModel, PersonModel, ResourceModel, UserModel } from '@bk2/shared-models';
import { warn } from './log.util';
import { isOwnership, isPerson, isPersonalRel, isUser } from 'libs/shared/util-core/src/lib/type.util';

/*-------------------------------------------- STRING ----------------------------------------------------- */
export function safeConvertString(fieldName: string, value: unknown, defaultValue: string): string {
    if (value === null || value === undefined) { // but not false or 0, that's why we can't test for !value
        return defaultValue;
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (typeof value === 'number') {
        return value + '';
    }
    if (typeof value === 'boolean') {
        return value.toString();
    }
    warn(`util/safeConvertString(${fieldName}): unknown type <${JSON.stringify(value)}>`);
    return JSON.stringify(value);
}

/*-------------------------------------------- NUMBER ----------------------------------------------------- */
export interface DoubleNumber {
  number1: number,
  number2: number
}

/**
 * Split a string by a delimiter into two parts and return the two parts as two numbers.
 * @param name 
 * @param delimiter 
 * @returns 
 */
export function name2numbers(name: string, delimiter = '/'): DoubleNumber {
  const _info = name.split(delimiter);
  if (_info.length !== 2) return { number1: 0, number2: 0 };
  return { number1: Number(_info[0].trim()), number2: Number(_info[1].trim()) };
}

/**
 * Fill a string or number with leading zeros to a certain length.
 * e.g. pad(5, 2) => '05'
 * @param num the number 
 * @param size the number of digits (including leading 0)
 * @returns 
 */
export function pad(num: number | string, size: number): string {
  num = num.toString();
  while (num.length < size) num = '0' + num;
  return num;
}

/**
 * Reversed function of name2numbers. It combines two numbers into a string with a delimiter.
 * e.g.   doubleNumber2name(5, 2) => '5/2'
 *        doubleNumber2name(5, 2, '_', 2) => '05_2'
 *        doubleNumber2name(5, undefined, '-', 3) => '005-..'
 * @param value1 
 * @param value2 
 * @param delimiter 
 * @returns 
 */
export function doubleNumber2name(value1?: number, value2?: number, delimiter = '/', size=1): string {
  return formatNumber(value1, size) + delimiter + formatNumber(value2 ?? 0, 1);
}

function formatNumber(value?: number, size?: number): string {
  if (!value) return '..';
  return (size && size > 1) ? pad(value ?? 0, size) : value + '';
}

export function safeConvertNumber(fieldName: string, value: unknown, defaultValue: number): number {
    if (value === null || value === undefined) { // but not false or 0, that's why we can't test for !value
        return defaultValue;
    }
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const _number = parseInt(value, 10);
        return isNaN(_number) ? defaultValue : _number;
    }
    if (typeof value === 'boolean') {
        return value === false ? 0 : 1;
    }
    warn(`util/safeConvertNumber(:${fieldName}): unknown type <${JSON.stringify(value)}>`);
    return defaultValue;
}

/*-------------------------------------------- BOOLEAN ----------------------------------------------------- */
export function safeConvertBoolean(fieldName: string, value: unknown, defaultValue: boolean): boolean {
    if (value === null || value === undefined) { // but not false or 0, that's why we can't test for !value
        return defaultValue;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return string2boolean(value);
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    warn(`util/safeConvertBoolean(:${fieldName}): unknown type <${JSON.stringify(value)}>`);
    return defaultValue;
}

export function string2boolean(val: string): boolean {
    if (!val) {
        return false;
    }
    switch (val.toLowerCase().trim()) {
        case 'true': case 'yes': case '1': return true;
        case 'false': case 'no': case '0': return false;
        default:
        // Any object of which the value is not undefined or null, 
        // including a Boolean object whose value is false, evaluates to true
            return Boolean(val);
    }
}

/*-------------------------------------------- ARRAY ----------------------------------------------------- */
/**
 * Converts a string containing a list of numbers into an array of numbers.
 * @param val a string containing a list of numbers
 * @param separator the separator between the numbers
 * @returns an array containing the numbers
 */
export function string2numberArray(val: string, separator = ','): number[] {
    return val.split(separator).map(function(_item) {
        return parseInt(_item, 10);
    });
}

export function removeElementFromStringArray(stringArray: string[], element: string): string[] {
    const _index = stringArray.indexOf(element);
    if (_index >= 0) {
        stringArray.splice(_index, 1);
    }
    return stringArray;
}

export function string2stringArray(val: string, separator = ','): string[] {
    const _stringArray = val.split(separator);
    // remove all empty strings
    const result: string[] = [];
    for (const element of _stringArray) {
      const _str = element.trim();
      if (_str.length > 0) {
        result.push(_str);
      }
    }
    return result;
}

/**
 * Convert an array of strings into a json object.
 * @param words an array of strings
 * @returns a json object with a property { name: element } per array element
 */
export function stringArray2ObjectArray(words: string[]): NameObject[] {
    const result: NameObject[] = [];
    for (const word of words) {
        result.push({ name: word});
    }
    return result;
}

/**
 * Takes an array of strings and returns a new array with only the unique elements, removing all duplicates.
 * This function is case insensitive.
 * It is an alternative to using Lodash uniq() function.
 * @param duplicates  the string array with duplicates
 * @returns  the string array with unique elements
 */
export function uniqueElements(duplicates: string[]): string[] {
  /* Pluck the values of the object mapping to an array */
  return Object.values(
    /* "Reduce" input array to an object mapping */
    duplicates.reduce((obj, str) =>     
    /* Insert str value into obj mapping with lower case key */
    ({ ...obj, [str.toLowerCase()] : str }), {})
  );
}

/*-------------------------------------------- NAME ----------------------------------------------------- */
export interface NameObject { name: string }

/**
 * Combines two name parts into a fullname considering the NameDisplay policy.
 * @param name1 
 * @param name2 
 * @param nameDisplay: FirstLast, LastFirst, FirstOnly, LastOnly
 * @returns the trimmed combined full name
 */
export function getFullName(name1?: string, name2?: string, nameDisplay = NameDisplay.FirstLast): string {
  if (!name2?.trim().length) return name1?.trim() ?? ''; // name2 is optional
  if (!name1?.trim().length) return name2?.trim() ?? ''; // name1 is optional
  switch (nameDisplay) {
    case NameDisplay.FirstLast:
      return name1.trim() + ' ' + name2.trim();
    case NameDisplay.LastFirst:
      return name2.trim() + ' ' + name1.trim();
    case NameDisplay.FirstOnly:
      return name1.trim();
    case NameDisplay.LastOnly:
      return name2.trim();
    default: return '';
  }
}

export function getModelName(model: any, tenantId: string, nameDisplay = NameDisplay.FirstLast): string {
  if (isPerson(model, tenantId)) {
    return getFullName(model.firstName, model.lastName, nameDisplay);
  }
  if (isUser(model, tenantId)) {
    return getFullName(model.firstName, model.lastName, nameDisplay);
  }
  if (isPersonalRel(model, tenantId)) {
    return getFullName(model.subjectFirstName, model.subjectLastName, nameDisplay) + ' - ' + getFullName(model.objectFirstName, model.objectLastName, nameDisplay);
  }
  if (isOwnership(model, tenantId)) {
    return getFullName(model.ownerName1, model.ownerName2, nameDisplay) + ' - ' + model.resourceName;
  }
  return model.name ?? '';
}

/**
 * Takes two names and returns the initials of both names.
 * e.g.   getInitials('John', 'Doe') => 'JD'
 * @param name1 
 * @param name2 
 * @returns 
 */
export function getInitials(name1: string, name2: string): string {
  let _initials = '';
  if (name1 && name1.length > 0) {
    _initials = name1.charAt(0).toUpperCase();
  }
  if (name2 && name2.length > 0) {
    _initials = _initials + name2.charAt(0).toUpperCase();
  }
  return _initials;
}

export function getAvatarNames(avatars: AvatarInfo[]): string {
  let names = '';
  for (const avatar of avatars) {
    const _name = getFullName(avatar.name1, avatar.name2);
    names = names.length > 0 ? names + ',' + _name : _name;
  }
  return names;
}

export function getAvatarKeys(avatars: AvatarInfo[]): string {
  let keys = '';
  for (const avatar of avatars) {
    keys = keys.length > 0 ? keys + ',' + avatar.key : avatar.key;
  }
  return keys;
}

export function newAvatarInfo(key: string, name1: string, name2: string, modelType: 'person' | 'org' | 'resource' | 'user' | 'group' | 'account', type: string, subType: string, label: string): AvatarInfo {
  return {
    key,
    name1,
    name2,
    modelType,
    type,
    subType,
    label
  };
}

export function getAvatarInfo(model?: PersonModel | OrgModel | ResourceModel | UserModel | GroupModel | AccountModel, modelType?: 'person' | 'org' | 'resource' | 'user' | 'group' | 'account'): AvatarInfo | undefined {
  if (!model || !modelType) return undefined;
  switch (modelType) {
    case 'person':
      const person = model as PersonModel;
      return newAvatarInfo(person.bkey, person.firstName, person.lastName, 'person', person.gender, '', person.firstName + ' ' + person.lastName);
    case 'org':
      const org = model as OrgModel;
      return newAvatarInfo(org.bkey, '', org.name, 'org', org.type, '', org.name);
    case 'group':
      const group = model as GroupModel;
      return newAvatarInfo(group.bkey, '', group.name, 'group', 'group', '', group.name);
    case 'resource':
      const resource = model as ResourceModel;
      return newAvatarInfo(resource.bkey, '', resource.name, 'resource', resource.type, resource.subType, resource.name);
    case 'user':
      const user = model as UserModel;
      return newAvatarInfo(user.bkey, user.firstName, user.lastName, 'user', '', '', user.firstName + ' ' + user.lastName);
    case 'account':
      const account = model as AccountModel;
      return newAvatarInfo(account.bkey, '', account.name, 'account', account.type, '', account.name);
  }
}

export function getAvatarInfoArray(model?: PersonModel | OrgModel | ResourceModel, modelType?: 'person' | 'org' | 'resource'): AvatarInfo[] {
  const avatarInfo = getAvatarInfo(model, modelType);
  return avatarInfo ? [avatarInfo] : [];
}

/*-------------------------------------------- JSON ----------------------------------------------------- */
/**
 * Pretty print JSON code.
 * source: https://stackoverflow.com/questions/37308420/angular-2-pipe-that-transforms-json-object-to-pretty-printed-json
 */
export function jsonPrettyPrint(value: unknown): string {
    return JSON.stringify(value, null, 2)
        .replace(/ /g, '&nbsp;') // note the usage of `/ /g` instead of `' '` in order to replace all occurences
        .replace(/\n/g, '<br/>'); // same here
}

/*-------------------------------------------- HTML ----------------------------------------------------- */
/**
 * Replace all HTML or XML tags in <> brackets from the string.
 * @param value the string potentially containing html or xml tags
 * @returns same string without the html or xml tags
 */
export function stripHtml(value: string): string {
    return value.replace(/<.*?>/g, ''); // replace tags
}
