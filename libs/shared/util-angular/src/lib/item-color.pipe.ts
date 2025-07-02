import { Pipe, PipeTransform } from '@angular/core';
import { BkModel } from '@bk2/shared/models';

@Pipe({
  name: 'itemColor',
})
export class ItemColorPipe implements PipeTransform {

  transform(item: BkModel): string {
      return getListItemColor(item.isArchived);
  }
}

/**
 * Determine the color to highlight archived items in a list.
 *   --bk-archived-color: #ffcc99;
 * @param isArchived  it is an archived item
 */
export function getListItemColor(isArchived: boolean): string {
  if (isArchived) return getArchivedItemColor();
  return '';
}

function getArchivedItemColor(): string {
  return 'light';
}
