import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryLabel } from '@bk2/shared/categories';
import { bkTranslate } from '@bk2/shared/i18n';
import { CategoryModel } from '@bk2/shared/models';

/**
 * Returns the translated i18n label for a category.
 */
@Pipe({
  name: 'categoryName',
})
export class CategoryNamePipe implements PipeTransform {
  transform(categoryId: number | undefined, categories: CategoryModel[]): string {
    if (categoryId === undefined)  return '';
    return bkTranslate(getCategoryLabel(categories, categoryId));
  }
}
