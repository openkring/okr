import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { CalEventFormModel } from './calevent-form.model';
import { categoryValidations, dateValidations, isAfterDate, isAfterOrEqualDate, stringValidations, urlValidations } from '@bk2/shared/util-core';
import { SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { CalEventType, Periodicity } from '@bk2/shared/models';


export const calEventFormValidations = staticSuite((model: CalEventFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  categoryValidations('type', model.type, CalEventType);
  dateValidations('startDate', model.startDate);
  dateValidations('endDate', model.endDate);
  stringValidations('locationKey', model.locationKey, SHORT_NAME_LENGTH);
  categoryValidations('periodicity', model.periodicity, Periodicity);
  dateValidations('repeatUntilDate', model.repeatUntilDate);
  urlValidations('url', model.url);
// tbd: responsiblePersons: AvatarInfo[] - not yet implemented

  test('startDate', '@calEventStartDateMandatory', () => {
    enforce(model.startDate).isNotEmpty();
  });
  // endDate is optional; if it is not set, it is set as the same as startDate

  // field cross validations
  omitWhen(!model.endDate || model.endDate === '', () => {
    test('endDate', '@calEventEndDateAfterStartDate', () => {
      enforce(isAfterOrEqualDate(model.endDate, model.startDate)).isTruthy();
    });
  });

  omitWhen(!model.repeatUntilDate || model.repeatUntilDate === '', () => {
    test('repeatUntilDate', '@calEventRepeatUntilDateAfterStartDate', () => {
      enforce(isAfterDate(model.repeatUntilDate, model.startDate)).isTruthy();
    });
  });

  // test for periodicity = undefined or 0 (= Once)
  omitWhen(!model.periodicity, () => {
    test('repeatUntilDate', '@calEventRepeatUntilDateMandatoryWithGivenPeriodicity', () => {
      enforce(model.repeatUntilDate).isNotEmpty();
    });
  })
});