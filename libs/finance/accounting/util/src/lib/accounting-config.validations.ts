import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountingConfigModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

export const accountingConfigValidations = staticSuite(
  (model: AccountingConfigModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);  // okey, tenants, isArchived
    stringValidations('accountingTenantId', model.accountingTenantId, SHORT_NAME_LENGTH, 1, true);
    // Both account links are optional (empty = not linked yet), but must stay account okeys.
    stringValidations('defaultExpenseAccountKey', model.defaultExpenseAccountKey);
    stringValidations('employeePayablesAccountKey', model.employeePayablesAccountKey);
    // Invoicing (1.76): selector / generated values, so no length cap; empty = not configured yet.
    stringValidations('receivablesAccountKey', model.receivablesAccountKey);
    stringValidations('invoiceTemplateId', model.invoiceTemplateId);
    // Kostenrechnung (1.65): a cost-centre okey, '' = keine Kostenstelle; legacy docs lack the field.
    stringValidations('defaultCostCenterKey', model.defaultCostCenterKey ?? '');
    numberValidations('fiscalYearStart', model.fiscalYearStart, true, 1, 12);
  });
