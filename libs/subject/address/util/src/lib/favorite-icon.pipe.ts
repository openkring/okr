import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared-config';

@Pipe({
  name: 'favoriteIcon',
  standalone: true
})
export class FavoriteIconPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(isFavorite: boolean): string {
    const iconName = isFavorite ? 'star' : 'star';
    return `${this.env.services.imgixBaseUrl}/logo/ionic/${iconName}.svg`;
  }
}