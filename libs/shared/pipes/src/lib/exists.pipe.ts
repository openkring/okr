import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'exists',
  standalone: true
})
export class ExistsPipe implements PipeTransform {

  transform(value: string): string {
      return !value ? '-' : value;
  }
}