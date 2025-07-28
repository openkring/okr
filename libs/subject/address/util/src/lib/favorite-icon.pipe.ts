import { inject, Pipe, PipeTransform } from '@angular/core';
import { ENV } from '@bk2/shared/config';

@Pipe({
  name: 'favoriteIcon',
})
export class FavoriteIconPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(isFavorite: boolean): string {
    const _iconName = isFavorite ? 'star' : 'star';
    return `${this.env.services.imgixBaseUrl}/logo/ionic/${_iconName}.svg`;
  }
}