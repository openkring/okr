import { Pipe, PipeTransform } from '@angular/core';

import { ResponsibilityModel } from '@bk2/shared-models';
import { convertDateFormatToString, DateFormat, getFullName } from '@bk2/shared-util-core';

import { isDelegateActive } from './responsibility.util';

/**
 * Pure pipe that resolves the responsible person/group for a given subjectModel+eventType.
 * Usage: {{ '' | responsible : responsibilities() : 'president' }}
 * If a delegate is active, appends "(delegiert von X bis DD.MM.YYYY)".
 */
@Pipe({ name: 'responsible', standalone: true, pure: true })
export class ResponsiblePipe implements PipeTransform {
  transform(
    id: string,
    responsibilities: ResponsibilityModel[]
  ): string {
    if (!id || id.length === 0) return '';

    const resp = responsibilities.find(r => r.bkey === id );
    if (!resp) return '';

    const name = getFullName(resp.responsibleAvatar?.name1, resp.responsibleAvatar?.name2);

    if (isDelegateActive(resp) && resp.responsibleAvatar) {
      const delegateName = getFullName(resp.delegateAvatar?.name1, resp.delegateAvatar?.name2);
      const until = convertDateFormatToString(resp.delegateValidTo, DateFormat.StoreDate, DateFormat.ViewDate, false);
      return `${delegateName} (delegiert von ${name} bis ${until})`;
    }
    return name;
  }
}

