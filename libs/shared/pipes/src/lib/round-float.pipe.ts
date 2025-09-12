import { Pipe, PipeTransform } from '@angular/core';

/**
 * Round a float number to the nearest integer
 */
@Pipe({
  name: 'round',
  standalone: true
})
export class RoundFloatPipe implements PipeTransform {
  transform(floatNumber: number | string): number {
    if (typeof floatNumber === 'string') {
      return Math.round(Number(floatNumber));
    }
    return Math.round(floatNumber);
  }
}