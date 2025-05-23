import { Pipe, PipeTransform } from "@angular/core";
import { SortCriteria, SortDirection, SortField } from "@bk2/shared/util";

@Pipe({
  name: 'isSorted',
})
export class IsSortedPipe implements PipeTransform {

  transform(currentSortCriteria: SortCriteria, sortField: SortField): boolean {
      return currentSortCriteria.field === sortField && currentSortCriteria.direction !== SortDirection.Undefined;
  }
}