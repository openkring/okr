import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryLabel, TransferTypes } from '@bk2/shared/categories';
import { bkTranslate } from '@bk2/shared/i18n';
import { TransferType } from '@bk2/shared/models';

/**
 * Returns the translated i18n label for a personal-rel considering the custom type.
 */
@Pipe({
  name: 'transferName',
})
export class TransferNamePipe implements PipeTransform {
  transform(transferType?: TransferType, label?: string): string {
    if (transferType === undefined) return '';
    const _name = transferType === TransferType.Custom ? label ?? '' : getCategoryLabel(TransferTypes, transferType);
    return bkTranslate(_name);
  }
}
