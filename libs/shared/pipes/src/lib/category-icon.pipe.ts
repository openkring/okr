import { inject, Pipe, PipeTransform } from '@angular/core';
import { getCategoryIcon } from '@bk2/shared/categories';
import { ENV } from '@bk2/shared/config';
import { CategoryModel } from '@bk2/shared/models';

@Pipe({
  name: 'categoryIcon',
})
export class CategoryIconPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(categoryId: number, categories: CategoryModel[]): string {
    const _iconName = getCategoryIcon(categories, categoryId);
    return `${this.env.app.imgixBaseUrl}/logo/ionic/${_iconName}.svg`;
  }
}