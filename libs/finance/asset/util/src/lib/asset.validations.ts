import { staticSuite } from 'vest';

import { NAME_LENGTH } from '@okr/shared-constants';
import { AssetModel } from '@okr/shared-models';
import { dateValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

/** Typing cap of the free-text fields name and assetNo (the form binds it as [maxLength]). */
export const ASSET_NAME_LENGTH = NAME_LENGTH;

/**
 * The asset edit dialog. It never had a mandatory field, so none is introduced here: the suite only
 * keeps the free-text fields within the input's cap, the acquisition date a real StoreDate (or empty)
 * and the useful life a whole number of months ≥ 0. Category and Kostenstelle are picked from a list.
 */
export const assetValidations = staticSuite((model: AssetModel) => {
  stringValidations('name', model.name, ASSET_NAME_LENGTH);
  stringValidations('assetNo', model.assetNo, ASSET_NAME_LENGTH);
  dateValidations('acquisitionDate', model.acquisitionDate ?? '');
  numberValidations('usefulLifeMonths', model.usefulLifeMonths ?? 0, true, 0);
});
