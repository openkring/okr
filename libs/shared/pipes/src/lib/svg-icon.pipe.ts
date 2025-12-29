import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared-config';

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


export function getSvgIconUrl(imgixBaseUrl: string, iconName: string, dir = 'icons'): string {
  if (iconName.length === 0) return '';
  return `${imgixBaseUrl}/logo/${dir}/${iconName}.svg`;
}