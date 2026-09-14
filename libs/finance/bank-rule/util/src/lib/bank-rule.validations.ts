import { only, staticSuite, test, enforce } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { BankRuleModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

export const bankRuleValidations = staticSuite(
  (model: BankRuleModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);
    stringValidations('term', model.term, 200, 1, true);
    stringValidations('title', model.title, SHORT_NAME_LENGTH, 1, true);
    stringValidations('accountKey', model.accountKey, 50, 1, true);
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
