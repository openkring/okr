import { inject, Pipe, PipeTransform } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { getCategoryPlaceholder } from '@okr/shared-categories';
import { CategoryModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';

@Pipe({
  name: 'categoryPlaceholder',
  standalone: true
})
export class CategoryPlaceholderPipe implements PipeTransform {
  private readonly i18nService = inject(I18nService);
  
  async transform(categoryId: number | undefined, categories: CategoryModel[]): Promise<string> {
    if (!categoryId)  return '';
    const placeholder = getCategoryPlaceholder(categories, categoryId);
    return await firstValueFrom(this.i18nService.translate(placeholder));
  }
}
