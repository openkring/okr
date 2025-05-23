import { Pipe, PipeTransform } from '@angular/core';
import { extractFirstPartOfOptionalTupel, extractSecondPartOfOptionalTupel } from '@bk2/shared/util';

/**
 * returns a part of a given label [key]@[label]
 * Can be used for:
 * - Avatars (modeltype.name)
 * - Locations (locationKey@name)
 * - Persons (personKey@name)
 * - Calendars (calendarKey@name)
 * - AlbumRoute (year@tenantId)
 * - Lockername (lockerNr/keyNr)
 * - etc.
 */
@Pipe({
  name: 'part',
})
export class PartPipe implements PipeTransform {
  transform(label: string, returnFirstPart = false, separator = '@'): string {
    return returnFirstPart ? extractFirstPartOfOptionalTupel(label, separator) : extractSecondPartOfOptionalTupel(label, separator);
  }
}
