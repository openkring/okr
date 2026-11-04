/** Room state `{ enabled: true }` (spec 1.139). Keep in sync with apps/functions/src/matrix-simple/chat-email.logic.ts. */
export const OKR_EMAIL_DELIVERY_EVENT = 'org.okr.email_delivery';

/** Absent, malformed or switched off all mean off. */
export function isEmailDeliveryOn(content: Record<string, unknown> | undefined): boolean {
  return content?.['enabled'] === true;
}
