import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared-config';
import { getSvgIconUrl } from '@bk2/shared-util-core';

export { getSvgIconUrl };

@Pipe({
  name: 'svgIcon',
  standalone: true,
})
export class SvgIconPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(iconName: string, dir = 'icons'): string {
    return getSvgIconUrl(this.env.services.imgixBaseUrl, iconName, dir);
  }
}