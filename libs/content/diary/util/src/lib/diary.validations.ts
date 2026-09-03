import { enforce, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { DiaryModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

import { diaryDateMatchesScope } from './diary-date.util';

const SCOPES = new Set(['day', 'month', 'year']);
const STATUSES = new Set(['draft', 'final']);

export const diaryValidations = staticSuite((model: DiaryModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('title', model.title, LONG_NAME_LENGTH);
  stringValidations('text', model.text, DESCRIPTION_LENGTH * 10);
  stringValidations('customLocationLabel', model.customLocationLabel, LONG_NAME_LENGTH);
  // `stringValidations`'s maxLength check only fires when `isMandatory` is true (see
  // `omitWhen(maxLength === undefined || isMandatory === false, ...)` in shared-util-core), but
  // title/text/customLocationLabel are optional fields here — so the length ceiling is enforced
  // explicitly instead of relying on that gated check.
  test('title', 'tooLong', () => {
    enforce(model.title).shorterThanOrEquals(LONG_NAME_LENGTH);
  });
  test('text', 'tooLong', () => {
    enforce(model.text).shorterThanOrEquals(DESCRIPTION_LENGTH * 10);
  });
  test('customLocationLabel', 'tooLong', () => {
    enforce(model.customLocationLabel).shorterThanOrEquals(LONG_NAME_LENGTH);
  });

  test('authorKey', 'diaryAuthorMissing', () => {
    enforce(model.authorKey).isNotBlank();
  });
  test('scope', 'diaryScopeInvalid', () => {
    enforce(SCOPES.has(model.scope)).isTruthy();
  });
  test('status', 'diaryStatusInvalid', () => {
    enforce(STATUSES.has(model.status)).isTruthy();
  });
  // The one rule the form cannot bypass: the zero pattern of `date` must say what `scope` says.
  test('date', 'diaryDateScopeMismatch', () => {
    enforce(diaryDateMatchesScope(model.date, model.scope)).isTruthy();
  });
});
