import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared/config';

@Pipe({
  name: 'svgIcon',
})
export class SvgIconPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(iconName: string): string {
    return `${this.env.app.imgixBaseUrl}/logo/icons/${iconName}.svg`;
  }
}
