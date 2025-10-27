import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared-config';

@Pipe({
  name: 'svgIcon',
  standalone: true,
})
export class SvgIconPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(iconName: string): string {
    return getSvgIconUrl(this.env.services.imgixBaseUrl, iconName);
  }
}


export function getSvgIconUrl(imgixBaseUrl: string, iconName: string): string {
  return `${imgixBaseUrl}/logo/icons/${iconName}.svg`;
}