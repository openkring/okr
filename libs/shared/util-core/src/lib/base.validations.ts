
import { only, staticSuite} from 'vest';
import { AvatarInfo, BkModel, isAddressableModel, isBaseModel, isNamedModel, isPersistedModel, isSearchableModel, isTaggedModel, ModelType } from '@bk2/shared/models';
import { booleanValidations, categoryValidations, stringValidations } from './vest.util';
import { LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/constants';

/**
 * Validates BkModel attributes:
 * - BaseModel: bkey
 * - NamedModel: name
 * - TaggedModel: tags
 * - SearchableModel: index
 * - AddressableModel: fav_email, fav_phone, fav_street, fav_zip, fav_city, fav_country
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
    stringValidations('name', model.name, SHORT_NAME_LENGTH);
  }
  if (isTaggedModel(model)) {
//    tagsValidations('tags', model.tags);
  }
  if (isSearchableModel(model)) {
    stringValidations('index', model.index, LONG_NAME_LENGTH);
  }
  if (isAddressableModel(model)) {
    stringValidations('fav_email', model.fav_email, SHORT_NAME_LENGTH);
    stringValidations('fav_phone', model.fav_phone, SHORT_NAME_LENGTH);
    stringValidations('fav_street', model.fav_street, SHORT_NAME_LENGTH);
    stringValidations('fav_zip', model.fav_zip, SHORT_NAME_LENGTH);
    stringValidations('fav_city', model.fav_city, SHORT_NAME_LENGTH);
    stringValidations('fav_country', model.fav_country, SHORT_NAME_LENGTH);
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
    categoryValidations(name + 'modelType', model.modelType, ModelType);
    stringValidations(name + 'label', model.key, SHORT_NAME_LENGTH);
  }
});
