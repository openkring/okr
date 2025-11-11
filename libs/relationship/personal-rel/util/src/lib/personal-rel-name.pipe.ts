import { Pipe, PipeTransform } from '@angular/core';
import { bkTranslate } from '@bk2/shared-i18n';
import { CategoryListModel, PersonalRelModel } from '@bk2/shared-models';
import { getItemLabel } from '@bk2/shared-util-core';

/**
 * Returns the translated i18n label for a personal-rel considering the custom type.
 */
@Pipe({
  name: 'personalRelName',
  standalone: true
})
export class PersonalRelNamePipe implements PipeTransform {
  transform(personalRel?: PersonalRelModel, personalRelTypes?: CategoryListModel): string {
    if (!personalRel || !personalRelTypes) return '';
    const _name = personalRel.type === 'custom' ? personalRel.label ?? '' : getItemLabel(personalRelTypes, personalRel.type);
    return bkTranslate(_name);
  }
}
