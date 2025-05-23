import { Pipe, PipeTransform } from '@angular/core';
import { getCategoryLabel, WorkingRelTypes } from '@bk2/shared/categories';
import { bkTranslate } from '@bk2/shared/i18n';
import { WorkingRelType } from '@bk2/shared/models';

/**
 * Returns the translated i18n label for a working-rel considering the custom type.
 */
@Pipe({
  name: 'workingRelName',
})
export class WorkingRelNamePipe implements PipeTransform {
  transform(workingRelType?: WorkingRelType, label?: string): string {
    if (workingRelType === undefined) return '';
    const _name = workingRelType === WorkingRelType.Custom ? label ?? '' : getCategoryLabel(WorkingRelTypes, workingRelType);
    return bkTranslate(_name);
  }
}
