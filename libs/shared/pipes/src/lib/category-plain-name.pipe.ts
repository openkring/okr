import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryStringField } from '@bk2/shared-categories';
import { CategoryModel, ColorIonic } from '@bk2/shared-models';

/**
 * Returns the translated i18n label for a category.
 */
@Pipe({
  name: 'categoryPlainName',
  standalone: true 
})
export class CategoryPlainNamePipe implements PipeTransform {
  transform(categoryId: number | undefined, categories: CategoryModel[]): string {
    if (categoryId === ColorIonic.White) return '';
    return categoryId === undefined ? '' : getCategoryStringField(categories, categoryId, 'name');
  }
}