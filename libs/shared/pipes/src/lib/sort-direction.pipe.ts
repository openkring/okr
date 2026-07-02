import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@okr/shared-config';
import { SortDirection } from '@okr/shared-util-core';

@Pipe({
  name: 'sortDirection',
  standalone: true
})
export class SortDirectionPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(sortDirection: SortDirection | null): string {
      if (sortDirection === null) return '?';
      // prior isSortedPipe already checked for undefined

      const iconName = sortDirection === SortDirection.Ascending ? 'arrow-up' : 'arrow-down';
      return `${this.env.services.imgixBaseUrl}/logo/ionic/${iconName}.svg`;
  }
}