import { Pipe, PipeTransform } from '@angular/core';
import { NameDisplay } from '@bk2/shared-models';
import { createFullName, getFullPersonName } from '@bk2/shared-util-core';

@Pipe({
  name: 'fullName',
  standalone: true
})
export class FullNamePipe implements PipeTransform {

  transform(name1: string, name2: string, nameDisplay = NameDisplay.FirstLast, modelType = 'person', nickName = '', useNickName = false): string {
    if (modelType === 'person') {
      return getFullPersonName(name1, name2, nickName, nameDisplay, useNickName);
    } else {  // Org or Account
      return createFullName(name1, name2);
    }
  }
}