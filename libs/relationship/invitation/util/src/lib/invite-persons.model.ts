import { AvatarInfo } from '@okr/shared-models';

/**
 * Was das Einladungs-Modal sammelt: wen, und mit welchem Satz.
 *
 * Die Nachricht gilt fuer alle Ausgewaehlten und landet in `invitation.notes` jedes erzeugten
 * Dokuments — pro Person eines, weil der Antwortzustand pro Person gefuehrt wird
 * (planning/specs/2026-09-06-open-events-invitation-model-spec.md, Entscheidung 11).
 */
export type InvitePersonsFormData = {
  invitees: AvatarInfo[];
  message: string;
};

export function newInvitePersonsFormData(): InvitePersonsFormData {
  return { invitees: [], message: '' };
}
