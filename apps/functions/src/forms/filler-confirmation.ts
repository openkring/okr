import type { Field } from '@okr/shared-models';
import { isSsnField } from '@okr/shared-util-core';

/**
 * The thank-you mail to the filler (1.125 B, spec §10, `sendFillerConfirmation`). Pure.
 *
 * The body is the confirmation `submitForm` also returns — built by `buildConfirmationMessage`,
 * which never puts an AHV number into a placeholder (R1) — never the raw answers. Nothing is stored.
 */

export const DEFAULT_FILLER_CONFIRMATION = 'Vielen Dank, deine Antwort ist eingegangen.';

/** One plain address: no list, no spaces, one `@` with something on both sides. */
const ADDRESS = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** HTML-escapes text for the form mails (this one and the board notification in `index.ts`). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The answer of the first visible `email` field (field order) that holds one address; never an AHV field. */
export function firstVisibleEmail(fields: Field[], values: Record<string, unknown>, visible: Set<string>): string | undefined {
  const sorted = [...(Array.isArray(fields) ? fields : [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const field of sorted) {
    if (field?.type !== 'email' || isSsnField(field) || !visible.has(field.id)) continue;
    const raw = values?.[field.key];
    const address = typeof raw === 'string' ? raw.trim() : '';
    if (address !== '' && address.length <= 254 && ADDRESS.test(address)) return address;
  }
  return undefined;
}

/** The mail body: the form name as heading, the text escaped with its line breaks kept. */
export function buildFillerConfirmationHtml(formName: string, text: string): string {
  const body = escapeHtml(text ?? '').replace(/\r?\n/g, '<br>');
  return `<h2 style="margin:0 0 16px;">${escapeHtml(formName ?? '')}</h2>\n<p>${body}</p>`;
}

/** The whole mail, or undefined when the form has no visible e-mail answer. `confirmation` '' = the default text. */
export function buildFillerMail(
  formName: string,
  confirmation: string,
  fields: Field[],
  answers: Record<string, unknown>,
  visible: Set<string>,
): { to: string; subject: string; html: string } | undefined {
  const to = firstVisibleEmail(fields, answers, visible);
  if (to === undefined) return undefined;
  const text = typeof confirmation === 'string' && confirmation.trim() !== '' ? confirmation : DEFAULT_FILLER_CONFIRMATION;
  return { to, subject: `${formName} – Bestätigung`, html: buildFillerConfirmationHtml(formName, text) };
}

/**
 * A short, value-free code for a failed send, for the log: the HTTP status of a provider error
 * («Mailtrap API error 400: <body>» → '400'), else the error's `code`, else 'unknown'. Never the
 * provider's response body, which can echo the recipient or the text.
 */
export function mailErrorCode(e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  const status = /\berror (\d{3})\b/i.exec(message)?.[1];
  if (status !== undefined) return status;
  const code = (e as { code?: unknown } | null | undefined)?.code;
  if ((typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code)) || typeof code === 'number') return String(code);
  return 'unknown';
}
