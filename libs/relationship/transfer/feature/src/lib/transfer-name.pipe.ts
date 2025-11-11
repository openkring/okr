import { Pipe, PipeTransform } from '@angular/core';

import { bkTranslate } from '@bk2/shared-i18n';
import { CategoryListModel, TransferModel } from '@bk2/shared-models';
import { getItemLabel } from '@bk2/shared-util-core';

/**
 * Returns the translated i18n label for a personal-rel considering the custom type.
 */
@Pipe({
  name: 'transferName',
  standalone: true
})
export class TransferNamePipe implements PipeTransform {
  transform(transfer?: TransferModel, transferTypes?: CategoryListModel): string {
    if (!transfer || !transferTypes) return '';
    const _name = transfer.type === 'custom' ? transfer.label ?? '' : getItemLabel(transferTypes, transfer.type);
    return bkTranslate(_name);
  }
}
