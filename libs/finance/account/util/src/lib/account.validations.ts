import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

/**
 * @param usedIds the account numbers already taken in the same chart of accounts, WITHOUT the
 *                number of the account being edited (see usedAccountIds) — a number must stay
 *                unique, otherwise a booking cannot tell the two accounts apart.
 */
export const accountValidations = staticSuite((model: AccountModel, tenants: string, tags: string, usedIds: string[] = []) => {

  // account names run long (bank accounts carry their IBAN), so the name cap is LONG_NAME_LENGTH — passed
  // to baseValidations as well, whose default NAME_LENGTH would otherwise still reject 51–100 characters.
  // The text input's counter (account.form.ts) uses the same constant.
  baseValidations(model, tenants, tags, LONG_NAME_LENGTH);  // okey, tenants, isArchived
  stringValidations('name', model.name, LONG_NAME_LENGTH, 1, true);
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
