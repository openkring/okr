import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountingConfigModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

export const accountingConfigValidations = staticSuite(
  (model: AccountingConfigModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);  // okey, tenants, isArchived
    stringValidations('accountingTenantId', model.accountingTenantId, SHORT_NAME_LENGTH, 1, true);
    // Both account links are optional (empty = not linked yet), but must stay account okeys.
    stringValidations('defaultExpenseAccountKey', model.defaultExpenseAccountKey, SHORT_NAME_LENGTH);
    stringValidations('employeePayablesAccountKey', model.employeePayablesAccountKey, SHORT_NAME_LENGTH);
  });
