
import { LONG_NAME_LENGTH, NAME_LENGTH, NUMBER_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, BkModel, isAddressableModel, isBaseModel, isNamedModel, isPersistedModel, isSearchableModel, isTaggedModel } from '@bk2/shared-models';
import { only, staticSuite } from 'vest';
import { booleanValidations, stringValidations } from './vest.util';

/**
 * Validates BkModel attributes:
 * - BaseModel: bkey
 * - NamedModel: name
 * - TaggedModel: tags
 * - SearchableModel: index
 * - AddressableModel: favEmail, favPhone, favStreetName, favStreetNumber, favZipCode, favCity, favCountryCode
 * - PersistedModel: tenants, isArchived
 * @param model BkModel
 * @param field optional field to validate
 */
export const baseValidations = staticSuite((model: BkModel, field?: string) => {
  if (field) only(field);

  if (isBaseModel(model)) {
    stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  }
  if (isNamedModel(model)) {
    stringValidations('name', model.name, NAME_LENGTH);
  }
  if (isTaggedModel(model)) {
//    tagsValidations('tags', model.tags);
  }
  if (isSearchableModel(model)) {
    stringValidations('index', model.index, LONG_NAME_LENGTH);
  }
  if (isAddressableModel(model)) {
    stringValidations('favEmail', model.favEmail, SHORT_NAME_LENGTH);
    stringValidations('favPhone', model.favPhone, SHORT_NAME_LENGTH);
    stringValidations('favStreetName', model.favStreetName, NAME_LENGTH);
    stringValidations('favStreetNumber', model.favStreetNumber, NUMBER_LENGTH);
    stringValidations('favZipCode', model.favZipCode, SHORT_NAME_LENGTH);
    stringValidations('favCity', model.favCity, SHORT_NAME_LENGTH);
    stringValidations('favCountryCode', model.favCountryCode, SHORT_NAME_LENGTH);
  }
  if (isPersistedModel(model)) {  
   // tenantValidations(model.tenants);
    booleanValidations('isArchived', model.isArchived, false);
  }
});


/**
 * Validates AvatarInfo model attributes:
 */
export const avatarInfoValidations = staticSuite((name: string, model?: AvatarInfo, field?: string) => {
  if (field) only(field);

  if (model) {      // AvatarInfo is optional
    stringValidations(name + '.key', model.key, SHORT_NAME_LENGTH);
    stringValidations(name + 'name1', model.name1, NAME_LENGTH);
    stringValidations(name + 'name2', model.name2, NAME_LENGTH);
    stringValidations(name + 'modelType', model.modelType, WORD_LENGTH);
    stringValidations(name + 'label', model.key, SHORT_NAME_LENGTH);
  }
});
