import { Pipe, PipeTransform, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';

import { I18nService } from '@okr/shared-i18n';

import { resolveLegacyCommentKey } from '@okr/comment-util';

/**
 * Renders a comment description.
 *
 * A comment written by a person is plain text and passes through untouched. A comment written by
 * the app is stored in i18n notation so it stays language-neutral in the database: a leading
 * '@scope.key' token, optionally followed by free text the user added (e.g. the note an invitee
 * typed with their answer). Only the leading token is translated; the remainder is appended as is.
 *
 * The key is data, not a compile-time constant — this is the data-driven case TranslatePipe exists
 * for, not a static label that belongs in a store's translateAll.
 */
@Pipe({
  name: 'commentText',
  standalone: true
})
export class CommentTextPipe implements PipeTransform {
  private readonly i18nService = inject(I18nService);

  transform(description: string | undefined | null): Observable<string> {
    if (!description) return of('');
    if (!description.startsWith('@')) return of(description);
    const spaceIndex = description.indexOf(' ');
    // keys written by older releases still sit in the database — map them onto their current
    // equivalent before translating, otherwise every legacy row reports a missing key
    const key = resolveLegacyCommentKey(spaceIndex === -1 ? description : description.substring(0, spaceIndex));
    const rest = spaceIndex === -1 ? '' : description.substring(spaceIndex + 1).trim();
    // an unresolvable key yields '' — fall back to the raw token so the row is never blank
    return this.i18nService.translate(key).pipe(
      map(translated => [translated || key, rest].filter(part => part.length > 0).join(' '))
    );
  }
}
