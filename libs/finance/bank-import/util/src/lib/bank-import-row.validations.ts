import { enforce, staticSuite, test } from 'vest';

import { BankImportRowModel } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { SHORT_NAME_LENGTH } from '@okr/shared-constants';

import { mainPartAmount } from './bank-import-row.util';

const PFX = '@finance/bank-import/util.validation.';
/** Buchungstext cap, shared by the main part and every further part (the form binds it too). */
export const BANK_IMPORT_TITLE_LENGTH = 100;

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
  (model: BankImportRowModel, tenants: string, tags: string) => {

    stringValidations('title', model.title, BANK_IMPORT_TITLE_LENGTH, 1, true);
    stringValidations('accountKey', model.accountKey, undefined, 1, true);

    // Split assignment: every further part is complete, and the main part keeps a positive rest.
    const splits = model.splits ?? [];
    test('splits', PFX + 'splitIncomplete', () => {
      enforce(splits.every(s => (s.title ?? '').trim().length > 0 && (s.title ?? '').length <= BANK_IMPORT_TITLE_LENGTH
        && !!s.accountKey && (s.amount ?? 0) > 0)).isTruthy();
    });
    test('splits', PFX + 'splitExceeds', () => {
      enforce(splits.length === 0 || mainPartAmount(model) > 0).isTruthy();
    });
  });
