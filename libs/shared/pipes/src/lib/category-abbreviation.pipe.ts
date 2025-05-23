import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryAbbreviation } from '@bk2/shared/categories';
import { CategoryModel } from '@bk2/shared/models';

@Pipe({
  name: 'categoryAbbreviation',
})
export class CategoryAbbreviationPipe implements PipeTransform {
  transform(categoryId: number, categories: CategoryModel[]): string {
      return getCategoryAbbreviation(categories, categoryId);
  }
}