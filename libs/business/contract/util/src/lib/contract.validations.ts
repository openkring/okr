import { enforce, only, staticSuite, test } from 'vest';
import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { CONTRACT_STATES, CONTRACT_TYPES, ContractModel } from '@okr/shared-models';
import { baseValidations, dateValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

export const contractValidations = staticSuite((model: ContractModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);
  baseValidations(model, tenants, tags, field);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 1, true);
  stringValidations('contractNumber', model.contractNumber, SHORT_NAME_LENGTH);
  test('contractType', '@business/contract/util.validation.type', () => { enforce(CONTRACT_TYPES.includes(model.contractType)).isTruthy(); });
  test('state', '@business/contract/util.validation.state', () => { enforce(CONTRACT_STATES.includes(model.state)).isTruthy(); });
  dateValidations('signingDate', model.signingDate);
  dateValidations('startDate', model.startDate);
  dateValidations('endDate', model.endDate);
  test('endDate', '@business/contract/util.validation.endBeforeStart', () => {
    if (model.startDate && model.endDate) enforce(model.endDate >= model.startDate).isTruthy();
  });
  numberValidations('autoRenewMonths', model.autoRenewMonths, true, 0, 120);
  test('autoRenewMonths', '@business/contract/util.validation.renewNeedsEnd', () => {
    if (model.autoRenewMonths > 0) enforce(model.endDate).isNotEmpty();
  });
  test('parties', '@business/contract/util.validation.parties', () => { enforce((model.parties ?? []).length).greaterThanOrEquals(1); });
  if (model.contractType === 'loan' || model.contractType === 'mortgage') {
    test('loan', '@business/contract/util.validation.loanRequired', () => { enforce(model.loan).isNotNullish(); });
    if (model.loan) {
      numberValidations('loan.interestRate', model.loan.interestRate, false, 0, 100);
      dateValidations('loan.rateFixedUntil', model.loan.rateFixedUntil);
      dateValidations('loan.maturityDate', model.loan.maturityDate);
      dateValidations('loan.outstandingAsOf', model.loan.outstandingAsOf);
    }
  }
});
