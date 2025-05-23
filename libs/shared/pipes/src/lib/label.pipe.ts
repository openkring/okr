import { Pipe, PipeTransform } from '@angular/core';
import { extractSecondPartOfOptionalTupel } from '@bk2/shared/util';

/**
 * Takes a string in the form of [key]@[label]
 * and converts it into a human readable label.
 * Can be used for:
 * - Avatars (modeltype@name)
 * - Locations (locationKey@name)
 * - Persons (personKey@name)
 * - Calendars (calendarKey@name)
 * - AlbumRoute (year@tenantId)
 * - etc.
 */
@Pipe({
  name: 'label',
})
export class LabelPipe implements PipeTransform {
  transform(label: string): string {
    return extractSecondPartOfOptionalTupel(label, '@');
  }
}
