import { Pipe, PipeTransform } from '@angular/core';
import { extractSecondPartOfOptionalTupel } from '@bk2/shared/util-core';

/**
 * Takes a location string in the form of [locationKey]@[locationLabel]
 * and converts it into a human readable label.
 * The label may consist of several location names, but the whole key is shown as is.
 */
@Pipe({
  name: 'locationLabel',
})
export class LocationLabelPipe implements PipeTransform {
  transform(name: string): string {
    return extractSecondPartOfOptionalTupel(name, '@');
  }
}
