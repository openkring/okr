import { inject, Pipe, PipeTransform } from '@angular/core';

import { AddressChannels, getCategoryIcon } from '@bk2/shared-categories';
import { ENV } from '@bk2/shared-config';

@Pipe({
  name: 'channelIcon',
  standalone: true
})
export class ChannelIconPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(channelId: number): string {
    const _iconName = getCategoryIcon(AddressChannels, channelId);
    return `${this.env.services.imgixBaseUrl}/logo/ionic/${_iconName}.svg`;
  }
}
