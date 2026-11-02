import { Pipe, PipeTransform } from '@angular/core';

import { formatAhv } from '@okr/shared-util-core';

// The pure AHV helpers live in shared-util-core (shared with the Cloud Functions); re-exported
// here so existing `@okr/shared-util-angular` importers keep working.
export { AhvFormat, ahvn2string, checkAhv, computeAhvn13checkDigit, formatAhv, isBlankAhv, maskAhv } from '@okr/shared-util-core';

@Pipe({
  name: 'ahvMask',
})
export class AhvMaskPipe implements PipeTransform {
  transform(value: string): string {
    return formatAhv(value);
  }
}
