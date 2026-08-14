import { END_FUTURE_DATE_STR, LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH, STORE_DATE_LENGTH, STORE_DATETIME_LENGTH, TIME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { enforce, omitWhen, test } from 'vest';
import { checkDate, DateFormat, isValidPartialStoreDate } from './date.util';
import { isArrayOfStrings, isAvatarInfo, isMoney } from './type.util';
import { AddressableModel, AvatarInfo, OkrModel, isAddressableModel, isBaseModel, isNamedModel, isPersistedModel, isSearchableModel, isTaggedModel, MoneyModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from '@okr/shared-models';

export function baseValidations(model: OkrModel, givenTenants: string, givenTags: string, field?: string) {

  omitWhen(!isBaseModel(model), () => {
    stringValidations('okey', model.okey, SHORT_NAME_LENGTH);
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
    stringValidations('favZipCode', m.favZipCode, SHORT_NAME_LENGTH);
  });

  omitWhen(!isPersistedModel(model), () => {
    const m = model as unknown as PersistedModel;
    booleanValidations('isArchived', m.isArchived, false);
  });
};


export function avatarValidations(fieldName: string, avatar: unknown) {

  omitWhen(!avatar, () => {
    test(fieldName, 'avatarFormat', () => {
      enforce(isAvatarInfo(avatar)).isTruthy();
    });

    test(fieldName, 'avatarFormat', () => {
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
    test(fieldName, 'moneyFormat', () => {
      enforce(isMoney(money)).isTruthy();
    });

    test(fieldName, 'moneyFormat', () => {
      const moneyModel = money as MoneyModel;
      numberValidations(`${fieldName}.amount`, moneyModel.amount, true, 0);
      stringValidations(`${fieldName}.currency`, moneyModel.currency, 3, 3, true);
      stringsValidations(`${fieldName}.periodicity`, moneyModel.periodicity, ['once', 'daily', 'workdays', 'monthly', 'biweekly', 'monthly', 'quarterly', 'yearly']);
    });
  });
}

export function booleanValidations(fieldName: string, value: unknown, shouldBe?: boolean) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'notBoolean', () => {
    enforce(value).isBoolean();
  });
  omitWhen(shouldBe === undefined, () => {
    test(fieldName, 'invalidValue', () => {
      enforce(value).equals(shouldBe);
    });
  });
}

export function categoryValidations(fieldName: string, category: unknown, categoryEnum: object) {
  test(fieldName, 'notNull', () => {
    enforce(category).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(category).isNotUndefined();
  });
  test(fieldName, 'notNumber', () => {
    enforce(category).isNumber();
  });
  test(fieldName, 'invalidEnum', () => {
    enforce(category).inside(Object.values(categoryEnum));
  });
}

export function stringsValidations(fieldName: string, value: unknown, validValues: string[]) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, '@validation.notString', () => {
    enforce(value).isString();
  });
  test(fieldName, 'invalidValue', () => {
    enforce(value).inside(validValues);
  });
}

export function stringArrayValidations(fieldName: string, values: unknown, validValues: string[]) {
  test(fieldName, 'notNull', () => {
    enforce(values).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(values).isNotUndefined();
  });
  test(fieldName, 'notArray', () => {
    enforce(Array.isArray(values)).isTruthy();
  });
  omitWhen(!Array.isArray(values), () => {
    (values as unknown[]).forEach(values => {
      test(fieldName, '@validation.notString', () => {
        enforce(values).isString();
      });
    });
    (values as string[]).forEach((value, index) => {
      test(`${fieldName}[${index}]`, 'invalidValue', () => {
        enforce(value).inside(validValues);
      });
    });
  });
}

export function stringArrayContainsValidation(
  fieldName: string,
  values: unknown,
  requiredValues: string[],
  isMandatory = true
) {
  test(fieldName, 'notArray', () => {
    enforce(Array.isArray(values)).isTruthy();
  });

  omitWhen(!isMandatory, () => {
    test(fieldName, 'tenantsLength', () => {
      enforce((values as unknown[]).length).greaterThan(0);
    });
  });

  omitWhen(!Array.isArray(values), () => {
    (values as unknown[]).forEach(values => {
      test(fieldName, '@validation.notString', () => {
        enforce(values).isString();
      });
    });
    test(fieldName, 'missingRequiredValue', () => {
      const hasRequired = requiredValues.some(required =>
        (values as string[]).includes(required)
      );
      enforce(hasRequired).isTruthy();
    });
  });
}

export function dateValidations(fieldName: string, date: unknown) {

  stringValidations(fieldName, date, STORE_DATE_LENGTH, STORE_DATE_LENGTH);

  // END_FUTURE_DATE_STR ('99991231') is the open-ended sentinel used by every validity
  // period (membership dateOfExit, esign validTo, …) — it is outside the 1850..2100 range
  // on purpose and must not be reported as an invalid date.
  omitWhen(date === '' || date === END_FUTURE_DATE_STR, () => {
    test(fieldName, 'invalidDate', () => {
      enforce(checkDate(fieldName, date as string, DateFormat.StoreDate, 1850, 2100, false)).isTruthy();
    });
  });
}

/**
 * Like dateValidations, but also accepts the two partial StoreDate forms:
 * '19850000' (year only) and '00000415' (birthday, year unknown).
 *
 * Use ONLY on the person dateOfBirth/dateOfDeath fields. Every other date field must
 * stay on dateValidations — a partial value elsewhere is a bug, not an input.
 */
export function partialDateValidations(fieldName: string, date: unknown) {

  stringValidations(fieldName, date, STORE_DATE_LENGTH, STORE_DATE_LENGTH);

  omitWhen(date === '', () => {
    test(fieldName, 'invalidDate', () => {
      enforce(isValidPartialStoreDate(date as string)).isTruthy();
    });
  });
}

export function timeValidations(fieldName: string, timeValue: unknown) {

  stringValidations(fieldName, timeValue, 5, TIME_LENGTH);

  omitWhen(timeValue === '', () => {
    test(fieldName, 'invalidTime', () => {
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

export function dateTimeValidations(fieldName: string, date: unknown) {

  stringValidations(fieldName, date, STORE_DATETIME_LENGTH, STORE_DATETIME_LENGTH);

  omitWhen(date === '', () => {
    test(fieldName, 'invalidDateTime', () => {
      enforce(checkDate(fieldName, date as string, DateFormat.StoreDateTime, 1850, 2100, false)).isTruthy();
    });
  });
}

export function numberValidations(fieldName: string, value: unknown, isInteger = true, min = 0, max?: number) {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, 'notNumber', () => {
    enforce(value).isNumber();
  });
  omitWhen(isInteger === false, () => {
    test(fieldName, 'notInteger', () => {
      enforce(Number.isInteger(Number(value))).isTruthy();
    });
  });
  test(fieldName, 'tooSmall', () => {
    enforce(value).greaterThanOrEquals(min);
  });
  omitWhen(max === undefined, () => {
    test(fieldName, 'tooLarge', () => {
      enforce(value).lessThanOrEquals(max);
    });
  });
}

export function stringValidations(fieldName: string, value: unknown, maxLength?: number, minLength = 0, isMandatory = false): void {
  test(fieldName, 'notNull', () => {
    enforce(value).isNotNull();
  });
  test(fieldName, 'notUndefined', () => {
    enforce(value).isNotUndefined();
  });
  test(fieldName, '@validation.notString', () => {
    enforce(value).isString();
  });
  omitWhen(isMandatory === false, () => {
    test(fieldName, 'required', () => {
      enforce(value as string).isNotBlank();
    });
  });
  omitWhen(maxLength === undefined || isMandatory === false, () => {
    test(fieldName, 'tooLong', () => {
      enforce(value as string).shorterThanOrEquals(maxLength);
    });
  });
  omitWhen(minLength === undefined || isMandatory === false, () => {
    test(fieldName, 'tooShort', () => {
      enforce(value as string).longerThanOrEquals(minLength);
    });
  });
}

export function tenantValidations(tenants: unknown, givenTenants: string) {
  stringArrayContainsValidation('tenants', tenants, givenTenants.split(','));
  stringArrayValidations('tenants', tenants, givenTenants.split(','));
  test('tenants', 'tenantsType', () => {
    enforce(isArrayOfStrings(tenants)).isTruthy();
  });

  test('tenants', 'tenantsLength', () => {
    enforce((tenants as string[]).length).greaterThan(0);
  });

  const _tenants = tenants as string[];
  const _givenTenants = givenTenants.split(',');
  _tenants.forEach((tenant) => {
    test('tenants', 'tenantValid', () => {
      enforce(tenant).inside(_givenTenants);
    });
  });
}

/**
 * Whether the given fields are free of validation errors — the validity a form should report.
 *
 * The model-wide suites (personValidations, userValidations, …) also validate data the form
 * never renders: a person's `tags`, `index`, `notes`, `bexioId`. An error there makes
 * `result.isValid()` false, which disables the change-confirmation bar with NOTHING on screen
 * explaining why and no field to correct — that is how a legacy tag on a person document made
 * the whole profile page unsavable. A form's save state must reflect the fields that form edits;
 * data problems elsewhere belong in the AOC data-validation reports, which still run the full suite.
 *
 * @param result the suite result to inspect
 * @param fieldNames the fields the form actually renders and edits
 */
export function isValidForFields(result: { hasErrors: (fieldName?: string) => boolean }, fieldNames: string[]): boolean {
  return !fieldNames.some(fieldName => result.hasErrors(fieldName));
}

export function tagValidations(fieldName: string, tags: unknown, givenTags: string) {
  stringValidations(fieldName, tags, LONG_NAME_LENGTH);
  // Both sides are trimmed: the configured lists in the `tags` collection are authored with
  // ", " separators ("@tag.advertiser, @tag.bexio, …") while a model's own tags field is written
  // without them, and stringArrayValidations matches exactly. Splitting untrimmed left every
  // configured tag but the first with a leading space, so it could never match — which silently
  // invalidated the ENTIRE form of any tagged person/org/document, on a field most forms don't
  // even render (the profile page showed no error, it just refused to save).
  const tagsArray = splitTags(typeof tags === 'string' ? tags : '');
  stringArrayValidations(fieldName, tagsArray, splitTags(givenTags));
}

/** Splits a comma-separated tag string into trimmed, non-empty tags. */
function splitTags(tags: string): string[] {
  return tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
}

export function urlValidations(fieldName: string, url: unknown) {
  stringValidations(fieldName, url, URL_LENGTH);

  omitWhen(url === '', () => {
    test(fieldName, 'urlStart', () => {
      const _url = url as string;
      enforce(_url.startsWith('https://') || _url.startsWith('assets') || _url.startsWith('tenant') || _url.startsWith('/')).isTruthy();
    });
  });
}
