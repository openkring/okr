import { only, staticSuite, test, enforce } from 'vest';

import { BankRuleModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

export const bankRuleValidations = staticSuite(
  (model: BankRuleModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);
    stringValidations('term', model.term, 200, 1, true);
    // 100 = the form's maxLength for the Buchungstext. A cap below what the input accepts
    // invalidates the form with no visible error.
    stringValidations('title', model.title, 100, 1, true);
    stringValidations('accountKey', model.accountKey, undefined, 1, true);
    numberValidations('priority', model.priority, true, -1000, 1000);
    test('condition', 'bankRule.condition.invalid', () => {
      enforce(['contains', 'startsWith', 'endsWith', 'regex'].includes(model.condition)).isTruthy();
    });
    test('term', 'bankRule.term.regexInvalid', () => {
      if (model.condition !== 'regex') return;
      let compiles = true;
      try { new RegExp(model.term, 'i'); } catch { compiles = false; }
      enforce(compiles).isTruthy();
    });
  });
