import { Pipe, PipeTransform } from '@angular/core';
import { NameDisplay } from '@bk2/shared-models';
import { getFullName } from '@bk2/shared-util-core';

@Pipe({
  name: 'fullName',
  standalone: true
})
export class FullNamePipe implements PipeTransform {

  transform(name1: string, name2?: string, nameDisplay = NameDisplay.FirstLast): string {
    return getFullName(name1, name2, nameDisplay);
  }
}