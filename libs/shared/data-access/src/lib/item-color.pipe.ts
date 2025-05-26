import { Pipe, PipeTransform } from '@angular/core';
import { BkModel } from '@bk2/shared/models';
import { getListItemColor } from '@bk2/shared/util';

@Pipe({
  name: 'itemColor',
})
export class ItemColorPipe implements PipeTransform {

  transform(item: BkModel): string {
      return getListItemColor(item.isArchived);
  }
}
