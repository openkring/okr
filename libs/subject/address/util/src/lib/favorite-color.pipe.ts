import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'favoriteColor',
})
export class FavoriteColorPipe implements PipeTransform {

  transform(isFavorite: boolean): string {
      return isFavorite ? 'primary' : '';
  }
}
