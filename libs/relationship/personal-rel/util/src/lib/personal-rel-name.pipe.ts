import { inject, Pipe, PipeTransform } from '@angular/core';

import { CategoryListModel, PersonalRelModel } from '@bk2/shared-models';
import { getItemLabel } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';
import { Observable, of } from 'rxjs';

/**
 * Returns the translated i18n label for a personal-rel considering the custom type.
 */
@Pipe({
  name: 'personalRelName',
  standalone: true
})
export class PersonalRelNamePipe implements PipeTransform {
  private readonly i18nService = inject(I18nService);

  transform(personalRel?: PersonalRelModel, personalRelTypes?: CategoryListModel): Observable<string> {
    if (!personalRel || !personalRelTypes) return of('');
    const label = personalRel.type === 'custom' ? personalRel.label ?? '' : getItemLabel(personalRelTypes, personalRel.type);
    return this.i18nService.translate(label);
  }
}
