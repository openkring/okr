import { Pipe, PipeTransform } from '@angular/core';
import { ModelType, NameDisplay } from '@bk2/shared/models';
import { createFullName, getFullPersonName } from '@bk2/shared/util-core';

@Pipe({
  name: 'fullName',
})
export class FullNamePipe implements PipeTransform {

  transform(name1: string, name2: string, nameDisplay = NameDisplay.FirstLast, modelType = ModelType.Person, nickName = '', useNickName = false): string {
    if (modelType === ModelType.Person) {
      return getFullPersonName(name1, name2, nickName, nameDisplay, useNickName);
    } else {  // Org or Account
      console.log('FullNamePipe: Org or Account', name1, name2);
      return createFullName(name1, name2);
    }
  }
}