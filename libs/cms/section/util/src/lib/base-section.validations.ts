import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { ColorIonic, SectionModel } from '@okr/shared-models';
import { booleanValidations, categoryValidations, stringValidations } from '@okr/shared-util-core';

export const baseSectionValidations = staticSuite((model: SectionModel, field?: string) => {
  if (field) only(field);

  stringValidations('okey', model.okey);
  // Caps must match the maxLength the form actually offers, otherwise the counter invites
  // input that the suite then rejects as 'tooLong'. okr-text-input defaults to NAME_LENGTH.
  stringValidations('name', model.name, NAME_LENGTH);
  stringValidations('type', model.type);
  // tbd: tagValidations('tags', model.tags);
  // `index` is generated (get<Model>Index) and the service overwrites it at save time, AFTER
  // this suite runs — a cap here can only reject a value the user cannot see or edit, so the
  // form would just never offer its save bar. Left uncapped on purpose; see vest.util.
  stringValidations('index', model.index);
  // tbd: tenantValidations(model.tenants);
  booleanValidations('isArchived', model.isArchived, false);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  // A real RoleName check is deliberately absent. The block that used to sit here was commented
  // out AND broken twice over: its message '@roleTypeMustBeRoleName' had no scope path, so it
  // would have resolved against a top-level main-bundle key that exists in no language, and
  // `enforce(typeof(x)).equals('RoleName')` compares a runtime typeof (always 'string') against
  // a type name, so it could only ever fail. Removed 2026-09-01.
  //
  // Adding one for real needs a runtime list of RoleName (the type is a pure TS union today) and
  // an audit of the roleNeeded values already stored — an unknown value would invalidate the
  // whole edit form, exactly the way an unknown tag does.
  stringValidations('roleNeeded', model.roleNeeded);
  categoryValidations('color', model.color, ColorIonic);
  // title/subTitle are rendered with [maxLength]=LONG_NAME_LENGTH in section-configuration.
  stringValidations('title', model.title, LONG_NAME_LENGTH);
  stringValidations('subTitle', model.subTitle, LONG_NAME_LENGTH);
  // tbd: content: ContentConfig

});
