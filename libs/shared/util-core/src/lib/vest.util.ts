import { LONG_NAME_LENGTH, STORE_DATE_LENGTH, STORE_DATETIME_LENGTH, TIME_LENGTH, URL_LENGTH } from '@bk2/shared-constants';
import { AllRoles, Roles } from '@bk2/shared-models';
import { enforce, omitWhen, test } from 'vest';
import { checkDate, DateFormat } from './date.util';
import { isArrayOfStrings } from './type.util';

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

export function tenantValidations(givenTenants: string, tenants: unknown ) {

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

export function tagValidations(givenTags: string, fieldName: string, tags: unknown) {
  // there is no min length as tags are optional
  stringValidations(fieldName, tags, LONG_NAME_LENGTH);
  const _tags = tags as string;
  const _tagsArray = _tags.split(',');
  const _givenTags = givenTags.split(',');
  _tagsArray.forEach((tag) => {
    test(fieldName, '@validation.tagValid', () => {
      enforce(tag).inside(_givenTags);
    });
  });
}

export function roleValidations(fieldName: string, roles: unknown) {
  // type should be Roles
  test(fieldName, '@validation.rolesType', () => {
    enforce(typeof roles === 'object').isTruthy();
  });
  const _roleKeys = Object.keys(roles as Roles);
  test(fieldName, '@validation.minRoles', () => {
    enforce(_roleKeys.length).greaterThan(0);
  });
  const _givenRoles = AllRoles.split(',');
  _roleKeys.forEach((_key) => {
    test(fieldName, '@validation.keyValues', () => {
      enforce(_key).inside(_givenRoles);
    });
  });
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

    test(fieldName, '@validation.urlValid', () => {
      enforce(url)['isURL']({
        protocols: ['https'],
        require_tld: false,
        require_protocol: false,
        require_host: false,
        require_port: false,
        require_valid_protocol: false,
        allow_underscores: false,
        allow_trailing_dot: false,
        allow_protocol_relative_urls: false,
        allow_fragments: false,
        allow_query_components: true,
        validate_length: true,
      });
    });
  });
}


