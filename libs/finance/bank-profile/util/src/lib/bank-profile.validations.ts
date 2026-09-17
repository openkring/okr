import { only, omitWhen, staticSuite, test, enforce } from 'vest';

import { BankProfileModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

export const bankProfileValidations = staticSuite(
  (model: BankProfileModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);
    baseValidations(model, tenants, tags, field);
    stringValidations('iban', model.iban, 34, 15, true);
    stringValidations('bankName', model.bankName, 50, 1, true);   // 50 = the form's maxLength
    stringValidations('accountKey', model.accountKey, undefined, 1, true);
    // The fee account is optional for every format that states no fee, and mandatory for the one
    // that does (spec 1.62 §3.1) — a RaiseNow profile without it would silently drop the fee line.
    stringValidations('feeAccountKey', model.feeAccountKey, undefined, 0, false);
    omitWhen(model.format !== 'raisenow', () => {
      test('feeAccountKey', 'required', () => {
        enforce(model.feeAccountKey).isNotBlank();
      });
    });
    stringValidations('currency', model.currency, undefined, 0, true);
    test('format', 'bankProfile.format.invalid', () => {
      enforce(['postfinance', 'zkb', 'yuh', 'vz', 'gkb', 'swissquote', 'raisenow', 'bonuscard', 'postfinance-card'].includes(model.format)).isTruthy();
    });
  });
