import { Pipe, PipeTransform } from '@angular/core';
import { bkTranslate } from '@bk2/shared-i18n';
import { CategoryListModel, WorkrelModel } from '@bk2/shared-models';
import { getItemLabel } from '@bk2/shared-util-core';

/**
 * Returns the translated i18n label for a personal-rel considering the custom type.
 */
@Pipe({
  name: 'workrelName',
  standalone: true
})
export class WorkrelNamePipe implements PipeTransform {
  transform(workrel?: WorkrelModel, workrelTypes?: CategoryListModel): string {
    if (!workrel || !workrelTypes) return '';
    const _name = workrel.type === 'custom' ? workrel.label ?? '' : getItemLabel(workrelTypes, workrel.type);
    return bkTranslate(_name);
  }
}
