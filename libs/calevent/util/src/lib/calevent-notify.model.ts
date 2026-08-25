/**
 * Which occurrences a notice covers. Mirrors `NotifyScope` in
 * `apps/functions/src/calendar/recipients.ts` — a lib cannot import the functions app.
 */
export type NotifyScope = 'event' | 'series';

/**
 * The form model of «Teilnehmende benachrichtigen» (spec
 * `2026-08-25-participant-messaging-spec.md` §1.1).
 *
 * Deliberately NOT a recipient list: the client sends the event key, the message and the scope,
 * and the Cloud Function derives who is addressed from `attendees[]` / `invitations`. A
 * client-supplied recipient list would be a megaphone anyone could aim.
 */
export interface CalEventNotifyFormData {
  /** Free text of the notice. */
  message: string;
  /** This occurrence, or this and every future occurrence of the series. */
  scope: NotifyScope;
  /** Read-only preview of who will be reached — display only, never sent. */
  recipientNames: string[];
  /** `false` hides the scope row: a single event has no series to address. */
  hasSeries: boolean;
}

/** Matches MAX_MESSAGE_LENGTH in `apps/functions/src/calendar/notify.ts`. */
export const MAX_NOTIFY_MESSAGE_LENGTH = 500;

/** A fresh, empty notice for `calevent`. */
export function newCalEventNotifyFormData(
  recipientNames: string[],
  hasSeries: boolean,
  message = '',
): CalEventNotifyFormData {
  return { message, scope: 'event', recipientNames, hasSeries };
}
