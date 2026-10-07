import { enforce, staticSuite, test } from 'vest';

import { COMMENT_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

import { InvitePersonsFormData } from './invite-persons.model';

/**
 * Wen einladen, und mit welcher Nachricht: mindestens eine Person, jede mit einem Schluessel
 * (sonst entsteht kein Einladungsdokument), und die Nachricht innerhalb der Kommentarlaenge.
 * Die Nachricht ist freiwillig.
 */
export const invitePersonsValidations = staticSuite((data: InvitePersonsFormData) => {
  test('invitees', 'required', () => {
    enforce(Array.isArray(data.invitees) && data.invitees.length > 0).isTruthy();
  });
  (data.invitees ?? []).forEach((invitee, i) => {
    stringValidations(`invitees[${i}].key`, invitee?.key, undefined, 0, true);
  });
  stringValidations('message', data.message, COMMENT_LENGTH);
});
