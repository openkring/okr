import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryLabel, PersonalRelTypes } from '@bk2/shared/categories';
import { bkTranslate } from '@bk2/shared/i18n';
import { PersonalRelType } from '@bk2/shared/models';

/**
 * Returns the translated i18n label for a personal-rel considering the custom type.
 */
@Pipe({
  name: 'personalRelName',
})
export class PersonalRelNamePipe implements PipeTransform {
  transform(personalRelType?: PersonalRelType, label?: string): string {
    if (!personalRelType) return '';
    const _name = personalRelType === PersonalRelType.Custom ? label ?? '' : getCategoryLabel(PersonalRelTypes, personalRelType);
    return bkTranslate(_name);
  }
}
