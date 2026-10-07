/**
 * The Verlauf (history) of an invoice or bill: entries in `finance-comments` (CommentModel shape), keyed by
 * `parentKey` = `invoice.<okey>` / `bill.<okey>`. Three sources share the collection:
 * - `tags: 'bexio'` — comments migrated from bexio (spec 1.68),
 * - `tags: 'note'` — notes the treasurer writes in the app (client create, firestore.rules),
 * - `tags: 'system,<kind>'` — events the Cloud Functions write here.
 * A system entry's description is `@<i18n key> <details>`: the app translates the leading key (CommentTextPipe)
 * and appends the details as they are, so the stored text stays language-neutral.
 */

export const FINANCE_HISTORY_COLLECTION = 'finance-comments';
const HISTORY_KEY_PREFIX = '@finance/accounting/feature.history.';

export type FinanceHistoryKind =
  | 'issued' | 'email' | 'post' | 'reminder' | 'reminderWaived' | 'payment' | 'paymentConfirmation' | 'cancelled'
  | 'billCreated' | 'billBooked' | 'billPayment' | 'billPaymentUnlinked';

export interface FinanceHistoryEntry {
  index: string;
  authorKey: string;
  authorName: string;
  creationDateTime: string;
  parentKey: string;
  description: string;
  attachmentKeys: string[];
  isArchived: boolean;
  tags: string;
  tenants: string[];
}

/** yyyyMMddHHmmss in Swiss local time (the functions run in UTC; bexio comments are local too). */
export function zurichStoreDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

/** One line of details: blanks dropped, single spaces, at most 1000 characters. */
export function historyDetails(...parts: (string | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.replace(/\s+/g, ' ').trim()).join(' · ').slice(0, 1000);
}

/** Recipients and subject of a sent mail, e.g. `→ a@b.ch · Cc: c@d.ch · «Rechnung 7» · 7.pdf`. */
export function emailDetails(mail: { to: string[]; cc?: string[]; bcc?: string[]; subject?: string; filename?: string; extraFiles?: string[] }): string {
  return historyDetails(
    mail.to.length > 0 && `→ ${mail.to.join(', ')}`,
    (mail.cc ?? []).length > 0 && `Cc: ${(mail.cc ?? []).join(', ')}`,
    (mail.bcc ?? []).length > 0 && `Bcc: ${(mail.bcc ?? []).join(', ')}`,
    !!mail.subject && `«${mail.subject}»`,
    [mail.filename ?? '', ...(mail.extraFiles ?? [])].filter(Boolean).join(', '),
  );
}

/** CHF from Rappen, Swiss style (1'234.50). */
export function chfText(rappen: number): string {
  const [whole, cents] = (Math.abs(rappen) / 100).toFixed(2).split('.');
  return `${rappen < 0 ? '-' : ''}CHF ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '’')}.${cents}`;
}

export function historyEntry(input: {
  tenantId: string; parentKey: string; kind: FinanceHistoryKind; details?: string;
  authorKey: string; authorName: string; now: Date;
}): FinanceHistoryEntry {
  const details = (input.details ?? '').trim();
  return {
    index: '',
    authorKey: input.authorKey,
    authorName: input.authorName,
    creationDateTime: zurichStoreDateTime(input.now),
    parentKey: input.parentKey,
    description: `${HISTORY_KEY_PREFIX}${input.kind}${details ? ` ${details}` : ''}`,
    attachmentKeys: [],
    isArchived: false,
    tags: `system,${input.kind}`,
    tenants: [input.tenantId],
  };
}
