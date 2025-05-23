import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { OrgFormModel } from './org-form.model';
import { categoryValidations, dateValidations, isAfterDate, stringValidations } from '@bk2/shared/util';
import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { OrgType } from '@bk2/shared/models';


export const orgFormValidations = staticSuite((model: OrgFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('orgName', model.orgName, SHORT_NAME_LENGTH, 3, true);
  categoryValidations('type', model.type, OrgType);
  dateValidations('dateOfFoundation', model.dateOfFoundation);
  dateValidations('dateOfLiquidation', model.dateOfLiquidation);
  stringValidations('taxId', model.taxId, SHORT_NAME_LENGTH);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  stringValidations('bexioId', model.bexioId, SHORT_NAME_LENGTH);
  stringValidations('membershipCategoryKey', model.membershipCategoryKey, SHORT_NAME_LENGTH); // tbd: check whether it is valid

  //tagValidations('tags', model.tags);

  // cross field validations
  omitWhen(model.dateOfLiquidation === '' || model.dateOfFoundation === '', () => {
    test('dateOfLiquidation', '@orgLiguidationAfterFoundation', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.dateOfLiquidation!, model.dateOfFoundation!)).isTruthy();
    });
  });
  // tbd: city is mandatory if zipCode is set -> lookup from swisscities


  // cross collection validations
  // tbd: cross reference bkey in subjects
});


