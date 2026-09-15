import { only, staticSuite, test, enforce } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { BankProfileModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

export const bankProfileValidations = staticSuite(
  (model: BankProfileModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);
    baseValidations(model, tenants, tags, field);
    stringValidations('iban', model.iban, 34, 15, true);
    stringValidations('bankName', model.bankName, SHORT_NAME_LENGTH, 1, true);
    stringValidations('accountKey', model.accountKey, 50, 1, true);
    stringValidations('currency', model.currency, 3, 3, true);
    test('format', 'bankProfile.format.invalid', () => {
      enforce(['postfinance', 'zkb', 'yuh', 'vz', 'gkb', 'swissquote'].includes(model.format)).isTruthy();
    });
  });
