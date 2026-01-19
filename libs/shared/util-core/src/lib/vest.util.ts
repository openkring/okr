import { LONG_NAME_LENGTH, NAME_LENGTH, NUMBER_LENGTH, SHORT_NAME_LENGTH, STORE_DATE_LENGTH, STORE_DATETIME_LENGTH, TIME_LENGTH, URL_LENGTH } from '@bk2/shared-constants';
import { enforce, omitWhen, test } from 'vest';
import { checkDate, DateFormat } from './date.util';
import { isArrayOfStrings, isAvatarInfo, isMoney } from './type.util';
import { AddressableModel, AvatarInfo, BkModel, isAddressableModel, isBaseModel, isNamedModel, isPersistedModel, isSearchableModel, isTaggedModel, MoneyModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from '@bk2/shared-models';

/**
 * Validates BkModel attributes:
 * - BaseModel: bkey
 * - NamedModel: name
 * - TaggedModel: tags
 * - SearchableModel: index
 * - AddressableModel: favEmail, favPhone, favStreetName, favStreetNumber, favZipCode, favCity, favCountryCode
 * - PersistedModel: tenants, isArchived
 * @param model BkModel
 * @param field optional field to validate
 */
export function baseValidations(model: BkModel, givenTenants: string, givenTags: string, field?: string) {

  omitWhen(!isBaseModel(model), () => {
    stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  });

  omitWhen(!isNamedModel(model), () => {
    const m = model as unknown as NamedModel;
    stringValidations('name', m.name, NAME_LENGTH);
  });
  
  omitWhen(!isTaggedModel(model), () => {
    const m = model as unknown as TaggedModel;
    tagValidations('tags', m.tags, givenTags);
  });

  omitWhen(!isSearchableModel(model), () => {
    const m = model as unknown as SearchableModel;
    stringValidations('index', m.index, LONG_NAME_LENGTH);
  });

  omitWhen(!isAddressableModel(model), () => {
    const m = model as unknown as AddressableModel;
    stringValidations('favEmail', m.favEmail, SHORT_NAME_LENGTH);
    stringValidations('favPhone', m.favPhone, SHORT_NAME_LENGTH);
    stringValidations('favStreetName', m.favStreetName, NAME_LENGTH);
    stringValidations('favStreetNumber', m.favStreetNumber, NUMBER_LENGTH);
    stringValidations('favZipCode', m.favZipCode, SHORT_NAME_LENGTH);
    stringValidations('favCity', m.favCity, SHORT_NAME_LENGTH);
    stringValidations('favCountryCode', m.favCountryCode, SHORT_NAME_LENGTH);
  });

  omitWhen(!isPersistedModel(model), () => {
    const m = model as unknown as PersistedModel;
    //tenantValidations(m.tenants, givenTenants);
    booleanValidations('isArchived', m.isArchived, false);
  });
};


export function avatarValidations(fieldName: string, avatar: unknown) {

  omitWhen(!avatar, () => {
    // test whether it is of type AvatarInfo
    test(fieldName, 'isAvatarInfo', () => {
      enforce(isAvatarInfo(avatar)).isTruthy();
    });

    // test each field of AvatarInfo
    test(fieldName, '@validation.avatarFormat', () => {
      const avatarInfo = avatar as AvatarInfo;
      stringValidations(`${fieldName}.key`, avatarInfo.key, NAME_LENGTH, 4, true);
      stringValidations(`${fieldName}.name1`, avatarInfo.name1, LONG_NAME_LENGTH);
      stringValidations(`${fieldName}.name2`, avatarInfo.name2, LONG_NAME_LENGTH);
      stringsValidations(`${fieldName}.modelType`, avatarInfo.modelType, ['person', 'org', 'resource', 'user', 'group', 'account']);
      stringValidations(`${fieldName}.type`, avatarInfo.type, LONG_NAME_LENGTH);
      stringValidations(`${fieldName}.subType`, avatarInfo.subType, LONG_NAME_LENGTH);
      stringValidations(`${fieldName}.label`, avatarInfo.label, LONG_NAME_LENGTH);
    });
  });
} 

export function moneyValidations(fieldName: string, money: unknown) {
  omitWhen(!money, () => {
    // test whether it is of type MoneyModel
    test(fieldName, 'isMoneyModel', () => {
      enforce(isMoney(money)).isTruthy();
    });

    // test each field of MoneyModel
    test(fieldName, '@validation.moneyFormat', () => {
      const moneyModel = money as MoneyModel;
      numberValidations(`${fieldName}.amount`, moneyModel.amount, true, 0);
      stringValidations(`${fieldName}.currency`, moneyModel.currency, 3, 3, true);
      stringsValidations(`${fieldName}.periodicity`, moneyModel.periodicity, ['once', 'daily', 'workdays', 'monthly', 'biweekly', 'monthly', 'quarterly', 'yearly']);
    });
  });
}

/**
 * Validates a boolean field
 * @param fieldName the name of the field that is validated (just for logging purposes)
 * @param value the value of the field
 * @param shouldBe an optional value to check against
 */
export function booleanValidations(fieldName: string, value: unknown, shouldBe?: boolean) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'booleanMandatory', () => {
    enforce(value).isBoolean();
  });
  omitWhen(shouldBe === undefined, () => {
    test(fieldName, `${fieldName} should be ${shouldBe}`, () => {
      enforce(value).equals(shouldBe);
    });
  });
}

/**
 * Validates a category field.
 * @param fieldName the name of the field that is validated (just for logging purposes)
 * @param category the category value
 * @param categoryEnum the value needs to be a value of this enum
 */
export function categoryValidations(fieldName: string, category: unknown, categoryEnum: object ) 

  {
  test(fieldName, 'notNull', () => {
    enforce(category).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(category).isNotUndefined();
  });
  test(fieldName, 'numberMandatory', () => {
    enforce(category).isNumber();
  });
  test(fieldName, 'enumValue', () => {
    enforce(category).inside(Object.values(categoryEnum));
  });
}

/**
 * Validates a given string against a list of valid values.
 * @param fieldName 
 * @param value 
 * @param validValues 
 */
export function stringsValidations(fieldName: string, value: unknown, validValues: string[]) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'stringMandatory', () => {
    enforce(value).isString();
  });
  test(fieldName, 'validValue', () => {
    enforce(value).inside(validValues);
  });
}

/**
 * Tests an array of strings against a list of valid values. e.g. sections, roles, tags
 * @param fieldName 
 * @param values  // array of strings, e.g. ['tag1', 'tag2']
 * @param validValues // array of valid strings, e.g. ['tag1', 'tag2', 'tag3'] -> 'tag1' and 'tag2' are valid, 'tag4' is not valid
 */
export function stringArrayValidations(fieldName: string, values: unknown, validValues: string[]) {
  test(fieldName, 'notNull', () => {
    enforce(values).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(values).isNotUndefined();
  });
  test(fieldName, 'arrayMandatory', () => {
    enforce(Array.isArray(values)).isTruthy();
  });
  omitWhen(!Array.isArray(values), () => {
    (values as unknown[]).forEach(values => {
      test(fieldName, 'stringMandatory', () => {
        enforce(values).isString();
      });
    });
    (values as string[]).forEach((value, index) => {
      test(`${fieldName}[${index}]`, 'validValue', () => {
        enforce(value).inside(validValues);
      });
    });
  });
}

/**
 * Tests if an array of strings contains at least one of the required values.
 * This is the opposite of stringArrayValidations.
 * It is usable for tenants.
 * @param fieldName 
 * @param values e.g. tenants ['a', 'b', 'c']
 * @param requiredValues e.g. required tenants ['b', 'd'] -> valid because 'b' is contained in values
 * @param isMandatory if true, the array must contain at least one of the required values
 */
export function stringArrayContainsValidation(
  fieldName: string, 
  values: unknown, 
  requiredValues: string[],
  isMandatory = true
) {
  test(fieldName, 'arrayMandatory', () => {
    enforce(Array.isArray(values)).isTruthy();
  });

  omitWhen(!isMandatory, () => {
    test(fieldName, '@validation.tenantsLength', () => {
      enforce((values as unknown[]).length).greaterThan(0);
    });
  });
  
  omitWhen(!Array.isArray(values), () => {
    (values as unknown[]).forEach(values => {
      test(fieldName, 'stringMandatory', () => {
        enforce(values).isString();
      });
    });
    test(fieldName, 'containsRequiredValue', () => {
      const hasRequired = requiredValues.some(required => 
        (values as string[]).includes(required)
      );
      enforce(hasRequired).isTruthy();
    });
  });
}

/**
 * Validate a date field. This must be in STOREDATE format: YYYYMMDD
 * @param fieldName the name of the field (just for logging purposes)
 * @param date the value of the field
 */
export function dateValidations(fieldName: string, date: unknown) {

  stringValidations(fieldName, date, STORE_DATE_LENGTH, STORE_DATE_LENGTH);

  omitWhen(date === '', () => {
    test(fieldName, 'validDate', () => {
      enforce(checkDate(fieldName, date as string, DateFormat.StoreDate, 1850, 2100, false)).isTruthy();
    });
  });
}

/**
 * Validate a time field. This must be in format Time = 'HH:mm',
 * @param fieldName the name of the field (just for logging purposes)
 * @param timeValue the value of the field
 */
export function timeValidations(fieldName: string, timeValue: unknown) {

  stringValidations(fieldName, timeValue, 5, TIME_LENGTH);

  omitWhen(timeValue === '', () => {
    test(fieldName, 'validTime', () => {
      enforce(checkTime(timeValue as string)).isTruthy();
    });
  });
}

export function extractMinutes(timeValue: string): number {
  const time = timeValue.split(':');
  const hours = parseInt(time[0], 10);
  const minutes = parseInt(time[1], 10);
  return hours * 60 + minutes;
}

export function checkTime(timeValue: string): boolean {
  const time = timeValue.split(':');
  if (time.length !== 2) {
    return false;
  }
  const hours = parseInt(time[0], 10);
  const minutes = parseInt(time[1], 10);
  if (isNaN(hours) || isNaN(minutes)) {
    return false;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return false;
  }
  return true;
}

/**
 * Validate a time field. This must be in STOREDATE format: YYYYMMDDHHMMSS
 * @param fieldName the name of the field (just for logging purposes)
 * @param date the value of the field
 */
export function dateTimeValidations(fieldName: string, date: unknown) {

  stringValidations(fieldName, date, STORE_DATETIME_LENGTH, STORE_DATETIME_LENGTH);

  omitWhen(date === '', () => {
    test(fieldName, 'validDateTime', () => {
      enforce(checkDate(fieldName, date as string, DateFormat.StoreDateTime, 1850, 2100, false)).isTruthy();
    });
  });
}

/**
 * Validates a number field.
 * @param fieldName the name of the field that is validated (just for logging purposes)
 * @param value the value of the field
 * @param isInteger if true, the value must be an integer, default is true
 * @param min the value must not be smaller than this, default is 0
 * @param max the value must not be bigger than this, default is undefined
 */
export function numberValidations(fieldName: string, value: unknown, isInteger = true, min = 0, max?: number) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'numberMandatory', () => {
    enforce(value).isNumber();
  });
  omitWhen(isInteger === false, () => {
    test(fieldName, 'integerMandatory', () => {
      enforce(Number.isInteger(Number(value))).isTruthy();
    });
  });
  test(fieldName, 'minWrong', () => {
    enforce(value).greaterThanOrEquals(min);
  });
  omitWhen(max === undefined, () => {
    test(fieldName, 'maxWrong', () => {
      enforce(value).lessThanOrEquals(max);
    });
  });
}

/**
 * Validates a string field
 * @param fieldName the name of the field that is validated (just for logging purposes)
 * @param value the value of the field
 * @param maxLength the value must not be longer than this, typically this is set to a constant in constants.ts
 * @param minLength the value must not be shorter than this, default is 0
 * @param isMandatory true if the field must not be empty, default is false
 */
export function stringValidations(fieldName: string, value: unknown, maxLength?: number, minLength = 0, isMandatory = false): void {
  test(fieldName, `@validation.${fieldName}NotNull`, () => {
    enforce(value).isNotNull();
  });
  test(fieldName, `@validation.${fieldName}NotUndefined`, () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, `@validation.${fieldName}TypeString`, () => {
    enforce(value).isString();
  });
  omitWhen(isMandatory === false, () => {
    test(fieldName, `@validation.${fieldName}Required`, () => {
      enforce(value as string).isNotBlank();
    });
  });
  omitWhen(maxLength === undefined || isMandatory === false, () => {
    test(fieldName, `Die Eingabe darf nicht aus mehr als ${maxLength} Zeichen bestehen`, () => {
      enforce(value as string).shorterThanOrEquals(maxLength);
    });
  });
  omitWhen(minLength === undefined || isMandatory === false, () => {
    test(fieldName, `Die Eingabe muss aus mind. ${minLength} Zeichen bestehen.`, () => {
      enforce(value as string).longerThanOrEquals(minLength);
    });
  });
}

export function tenantValidations(tenants: unknown, givenTenants: string) {
  stringArrayContainsValidation('tenants', tenants, givenTenants.split(','));
  stringArrayValidations('tenants', tenants, givenTenants.split(','));
  test('tenants', '@validation.tenantsType', () => {
    enforce(isArrayOfStrings(tenants)).isTruthy();
  });

  test('tenants', '@validation.tenantsLength', () => {
    enforce((tenants as string[]).length).greaterThan(0);
  });

  // test for valid tenant ids (givenTenants are defined in database collection tags)
  const _tenants = tenants as string[];
  const _givenTenants = givenTenants.split(',');
  _tenants.forEach((tenant) => {
    test('tenants', '@validation.tenantValid', () => {
      enforce(tenant).inside(_givenTenants);
    });
  });
}

export function tagValidations(fieldName: string, tags: unknown, givenTags: string, ) {
  // there is no min length as tags are optional
  stringValidations(fieldName, tags, LONG_NAME_LENGTH);
  // tags is a comma-separated string, split it to validate as array
  const tagsArray = typeof tags === 'string' ? tags.split(',').filter(t => t.length > 0) : [];
  stringArrayValidations(fieldName, tagsArray, givenTags.split(','));
}

export function urlValidations(fieldName: string, url: unknown ) {
  stringValidations(fieldName, url, URL_LENGTH);

  omitWhen(url === '', () => {
    test(fieldName, '@validation.urlStart', () => {
      const _url = url as string;
      // https: absolute, external url
      // assets: relative url to assets directory
      // tenant: relative url to storage directory (storagePath)
      // /: relative url to root
      enforce(_url.startsWith('https://') || _url.startsWith('assets') || _url.startsWith('tenant') || _url.startsWith('/')).isTruthy();
    });
  });

  // test the components of an absolute url only
  // tbd: this is not working correctly.
/*   omitWhen((url + '').startsWith('http') === false, () => {
    test(fieldName, '@validation.urlValidProtocol', () => {
      enforce(url)['isURL']({
        protocols: ['https'],
        require_protocol: true,
      });
    });
    test(fieldName, '@validation.urlHost', () => {
      enforce(url)['isURL']({
        require_host: true,
        require_port: false,
      });
    });
    test(fieldName, '@validation.urlParts', () => {
      enforce(url)['isURL']({
        allow_underscores: false,
        allow_trailing_dot: false,
        allow_protocol_relative_urls: false,
        allow_fragments: true,
        allow_query_components: true,
        validate_length: true,
      });
    });
  }); */
}


