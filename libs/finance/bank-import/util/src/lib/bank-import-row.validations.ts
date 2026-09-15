import { only, staticSuite } from 'vest';

import { BankImportRowModel } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

/**
 * Validates only the fields the assignment form (title/account) can actually edit — a staging
 * row's date/payee/amount/rawText are read-only display data, not form inputs (spec 1.60 §5.2).
 *
 * Deliberately NOT calling `baseValidations`: a staging row's `okey` IS the 64-character SHA-256
 * import key, while `baseValidations` caps an okey at SHORT_NAME_LENGTH (30). That cap made every
 * real row report `okey: tooLong`, so "Konto zuweisen" was permanently invalid — no
 * change-confirmation bar, nothing could be saved. The okey is neither shown nor editable here,
 * so this suite has no business judging it.
 */
export const bankImportRowValidations = staticSuite(
  (model: BankImportRowModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    stringValidations('title', model.title, 100, 1, true);
    stringValidations('accountKey', model.accountKey, 50, 1, true);
  });
