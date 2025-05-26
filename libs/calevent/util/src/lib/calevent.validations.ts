import { SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { CalEventModel, CalEventType, Periodicity } from '@bk2/shared/models';
import { baseValidations, categoryValidations, dateValidations, isAfterDate, isAfterOrEqualDate, stringValidations } from '@bk2/shared/util';
import { enforce, omitWhen, only, staticSuite, test} from 'vest';

export const calEventValidations = staticSuite((model: CalEventModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);
  categoryValidations('type', model.type, CalEventType);
  dateValidations('startDate', model.startDate);
  dateValidations('endDate', model.endDate);
  stringValidations('locationKey', model.locationKey, SHORT_NAME_LENGTH);
  categoryValidations('periodicity', model.periodicity, Periodicity);
  dateValidations('repeatUntilDate', model.repeatUntilDate);
  // tbd: responsiblePersons: AvatarInfo[] - not yet implemented

  test('startDate', '@calEventStartDateMandatory', () => {
    enforce(model.startDate).isNotEmpty();
  });
  test('endDate', '@calEventEndDateMandatory', () => {
    enforce(model.endDate).isNotEmpty();
  });

  // field cross validations
  test('endDate', '@calEventEndDateAfterStartDate', () => {
    enforce(isAfterOrEqualDate(model.endDate, model.startDate)).isTruthy();
  });

  omitWhen(model.periodicity === Periodicity.Once, () => {
    test('repeatUntilDate', '@calEventRepeatUntilDateMandatoryWithGivenPeriodicity', () => {
      enforce(model.repeatUntilDate).isNotEmpty();
    });
    test('repeatUntilDate', '@calEventRepeatUntilDateAfterStartDate', () => {
      enforce(isAfterDate(model.repeatUntilDate, model.startDate)).isTruthy();
    });
  })

});

// tbd: cross the locationKey to reference into locations

