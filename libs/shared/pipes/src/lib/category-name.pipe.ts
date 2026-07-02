import { inject, Pipe, PipeTransform } from '@angular/core';

import { getCategoryLabel } from '@okr/shared-categories';
import { I18nService } from '@okr/shared-i18n';
import { CategoryModel } from '@okr/shared-models';
import { firstValueFrom } from 'rxjs';

/**
 * Returns the translated i18n label for a category.
 */
@Pipe({
  name: 'categoryName',
  standalone: true
})
export class CategoryNamePipe implements PipeTransform {
  private readonly i18nService = inject(I18nService);

  async transform(categoryId: number | undefined, categories: CategoryModel[]): Promise<string> {
    if (categoryId === undefined)  return '';
    const label = getCategoryLabel(categories, categoryId);

    return await firstValueFrom(this.i18nService.translate(label));
  }
}
