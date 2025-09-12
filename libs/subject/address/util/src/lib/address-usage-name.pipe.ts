import { Pipe, PipeTransform } from '@angular/core';

import { AddressUsages } from '@bk2/shared-categories';
import { bkTranslate } from '@bk2/shared-i18n';
import { AddressUsage } from '@bk2/shared-models';

// address.usage | addressUsageName:address.usageLabel
@Pipe({
  name: 'addressUsageName',
  standalone: true
})
export class AddressUsageNamePipe implements PipeTransform {

  transform(usage: number, label: string): string {
    if (usage === AddressUsage.Custom) {
      if (label && label.length > 0) {
          return label;
      } else {
          return '';
      }
    } else {
      return bkTranslate(AddressUsages[usage].i18nBase + '.label');
    }
  }
}
