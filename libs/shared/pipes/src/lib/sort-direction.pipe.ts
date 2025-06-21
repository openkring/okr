import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared/config';
import { SortDirection } from '@bk2/shared/util';

@Pipe({
  name: 'sortDirection',
})
export class SortDirectionPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(sortDirection: SortDirection | null): string {
      if (sortDirection === null) return '?';
      // prior isSortedPipe already checked for undefined

      const _iconName = sortDirection === SortDirection.Ascending ? 'arrow-up' : 'arrow-down';
      return `${this.env.services.imgixBaseUrl}/logo/ionic/${_iconName}.svg`;
  }
}