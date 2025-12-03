import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'favoriteColor',
  standalone: true
})
export class FavoriteColorPipe implements PipeTransform {

  transform(isFavorite: boolean): string {
      return isFavorite ? 'primary' : 'light';
  }
}
