import { only, staticSuite } from 'vest';

import { BankImportRowModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

/**
 * Validates only the fields the assignment form (title/account) can actually edit — a staging
 * row's date/payee/amount/rawText are read-only display data, not form inputs (spec 1.60 §5.2).
 */
export const bankImportRowValidations = staticSuite(
  (model: BankImportRowModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);
    stringValidations('title', model.title, 100, 1, true);
    stringValidations('accountKey', model.accountKey, 50, 1, true);
  });
