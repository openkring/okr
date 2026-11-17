import { Pipe, PipeTransform } from '@angular/core';
import { extractFirstPartOfOptionalTupel, extractSecondPartOfOptionalTupel } from '@okr/shared-util-core';

/**
 * returns a part of a given label [key]@[label]; '' when the label is missing (null/undefined)
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
  standalone: true
})
export class PartPipe implements PipeTransform {
  transform(label: string | null | undefined, returnFirstPart = false, separator = '@'): string {
    return returnFirstPart ? extractFirstPartOfOptionalTupel(label, separator) : extractSecondPartOfOptionalTupel(label, separator);
  }
}
