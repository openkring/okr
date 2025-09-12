import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryPlaceholder } from '@bk2/shared-categories';
import { bkTranslate } from '@bk2/shared-i18n';
import { CategoryModel } from '@bk2/shared-models';

@Pipe({
  name: 'categoryPlaceholder',
  standalone: true
})
export class CategoryPlaceholderPipe implements PipeTransform {
  transform(categoryId: number | undefined, categories: CategoryModel[]): string {
    if (!categoryId)  return '';
    return bkTranslate(getCategoryPlaceholder(categories, categoryId));
  }
}
