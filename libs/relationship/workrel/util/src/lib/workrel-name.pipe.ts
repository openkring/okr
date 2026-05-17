import { inject, Pipe, PipeTransform } from '@angular/core';
import { CategoryListModel, WorkrelModel } from '@bk2/shared-models';
import { getItemLabel } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';
import { Observable, of } from 'rxjs';

/**
 * Returns the translated i18n label for a personal-rel considering the custom type.
 */
@Pipe({
  name: 'workrelName',
  standalone: true
})
export class WorkrelNamePipe implements PipeTransform {
  private readonly i18nService = inject(I18nService);

  transform(workrel?: WorkrelModel, workrelTypes?: CategoryListModel): Observable<string> {
    if (!workrel || !workrelTypes) return of('');
    const label = workrel.type === 'custom' ? workrel.label ?? '' : getItemLabel(workrelTypes, workrel.type);
    return this.i18nService.translate(label);
  }
}
