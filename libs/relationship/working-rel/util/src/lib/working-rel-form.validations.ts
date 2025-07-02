import { CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { GenderType, OrgType, Periodicity, WorkingRelState, WorkingRelType } from '@bk2/shared/models';
import { categoryValidations, dateValidations, isAfterOrEqualDate, numberValidations, stringValidations } from '@bk2/shared/util-core';
import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { WorkingRelFormModel } from './working-rel-form.model';


export const workingRelFormValidations = staticSuite((model: WorkingRelFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
 // tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  // subject
  stringValidations('subjectKey', model.subjectKey, SHORT_NAME_LENGTH);
  stringValidations('subjectName1', model.subjectName1, SHORT_NAME_LENGTH);
  stringValidations('subjectName2', model.subjectName2, SHORT_NAME_LENGTH);
  categoryValidations('subjectType', model.subjectType, GenderType);

  // object
  stringValidations('objectKey', model.objectKey, SHORT_NAME_LENGTH);
  stringValidations('objectName', model.objectName, SHORT_NAME_LENGTH);
  categoryValidations('objectType', model.objectType, OrgType);

  categoryValidations('type', model.type, WorkingRelType);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

   // cross field validations
  omitWhen(model.validFrom === '' || model.validTo === '', () => {
    test('validTo', '@workingRelValidToAfterValidFrom', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterOrEqualDate(model.validTo!, model.validFrom!)).isTruthy();
    });
  });

  numberValidations('price', model.price, true, 0, 1000000);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  categoryValidations('periodicity', model.periodicity, Periodicity);
  numberValidations('priority', model.priority, true, 0, 100);
  categoryValidations('state', model.state, WorkingRelState);
});
