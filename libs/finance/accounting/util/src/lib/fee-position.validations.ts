import { omitWhen, only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { FeePositionRule } from '@okr/shared-models';
import { numberValidations, stringValidations } from '@okr/shared-util-core';

export const feePositionValidations = staticSuite(
  (model: FeePositionRule, field?: string) => {
    if (field) only(field);

    stringValidations('key', model.key, SHORT_NAME_LENGTH, 1, true);
    stringValidations('label', model.label, SHORT_NAME_LENGTH, 1, true);
    // usage, type and source are selector values — no length cap, mandatory only.
    stringValidations('usage', model.usage, undefined, 0, true);
    stringValidations('type', model.type, undefined, 0, true);
    stringValidations('source', model.source, undefined, 0, true);
    omitWhen(model.source !== 'category', () => {
      stringValidations('categoryList', model.categoryList ?? '', undefined, 0, true);
    });
    // 'amount' is required for 'flag'/'rule' sources; do NOT default it with `?? 0` — that would
    // make notUndefined() pass trivially and silently accept a missing amount as valid.
    omitWhen(model.source === 'category' || model.source === 'manual', () => {
      numberValidations('amount', model.amount, true, 0, 100000);
    });
  });
