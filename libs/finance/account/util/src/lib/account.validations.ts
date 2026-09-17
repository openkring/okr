import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

/**
 * @param usedIds the account numbers already taken in the same chart of accounts, WITHOUT the
 *                number of the account being edited (see usedAccountIds) — a number must stay
 *                unique, otherwise a booking cannot tell the two accounts apart.
 */
export const accountValidations = staticSuite((model: AccountModel, tenants: string, tags: string, usedIds: string[] = [], field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);  // okey, tenants, isArchived
  // NAME_LENGTH matches both the text input's counter (account.form.ts) and the cap baseValidations
  // puts on every NamedModel; a lower value here made names of 31–50 characters fail silently.
  stringValidations('name', model.name, NAME_LENGTH, 1, true);
  stringValidations('id', model.id, SHORT_NAME_LENGTH);
  stringValidations('type', model.type, undefined, 0, true);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  stringValidations('parentKey', model.parentKey);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  // Only a root (a whole chart of accounts) stands on its own; every other account hangs in one.
  omitWhen(model.type === 'root', () => {
    test('parentKey', 'required', () => {
      enforce(model.parentKey).isNotBlank();
    });
  });

  // A root (a whole chart of accounts) carries no number, so nothing to compare.
  omitWhen(!model.id || model.id.length === 0, () => {
    test('id', '@finance/account/feature.id.duplicate', () => {
      enforce(usedIds.includes(model.id)).isFalsy();
    });
  });
});
