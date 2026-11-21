import { GroupModel, NewsletterSubscriptionModel, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';
import { isAdminMember, isNewsletterGroup } from '@okr/subject-group-util';

/**
 * Whether the subscription is active: not archived and without an exit date. The same rule as the server
 * (`isActiveSubscription` in functions/newsletter/tenant-link.logic.ts), which sets `dateOfExit` to the day
 * it ends a subscription — any exit date means ended, so the list never shows whom a send would refuse.
 */
export function isActiveSubscription(subscription: NewsletterSubscriptionModel): boolean {
  if (subscription.isArchived) return false;
  return (subscription.dateOfExit ?? '') === '';
}

/** The active subscriptions, sorted by the subscriber's name. */
export function activeSubscribers(subscriptions: NewsletterSubscriptionModel[]): NewsletterSubscriptionModel[] {
  return subscriptions
    .filter((s) => isActiveSubscription(s))
    .sort((a, b) => (a.personName ?? '').localeCompare(b.personName ?? ''));
}

/** The live (not archived) newsletter groups among `groups`. */
export function newsletterGroups(groups: GroupModel[]): GroupModel[] {
  return groups.filter((g) => !g.isArchived && isNewsletterGroup(g));
}

/**
 * Who sees a newsletter's subscribers (spec 1.169 §5.8): member admins, privileged users (admins
 * included) and the newsletter's own admins. Mirrors the `newsletterSubscriptions` read rule.
 */
export function canSeeSubscribers(group: GroupModel | undefined, user: UserModel | undefined): boolean {
  if (!group || !user) return false;
  if (hasRole('memberAdmin', user) || hasRole('privileged', user)) return true;
  return isAdminMember(group, user.personKey);
}

/**
 * Whether the user may send a newsletter by post. The letters carry postal addresses, which the
 * address vault keeps from a newsletter admin without one of these roles; the server refuses the
 * same (`newsletterSendCheck`).
 */
export function mayPostNewsletter(user: UserModel | undefined): boolean {
  return hasRole('memberAdmin', user) || hasRole('privileged', user);
}

/** One subscriber of a Mailchimp audience export. */
export interface ImportRow {
  email: string;
  firstName: string;
  lastName: string;
  /** Mailchimp `OPTIN_TIME`, as given */
  optinAt: string;
  /** Mailchimp `CONFIRM_TIME`, as given */
  confirmAt: string;
}

/** Splits CSV text into records: quoted fields may hold commas, line breaks and `""` for a quote. */
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      records.push(record); record = [];
    } else field += c;
  }
  if (field !== '' || record.length > 0) { record.push(field); records.push(record); }
  return records;
}

/**
 * Reads a Mailchimp audience export (CSV) into import rows. Columns are found by header name,
 * case-insensitively (`Email Address`, `First Name`, `Last Name`, `OPTIN_TIME`, `CONFIRM_TIME`); all others
 * are ignored. A UTF-8 BOM, CRLF and LF are accepted. Rows without an email address are skipped.
 */
export function parseMailchimpCsv(text: string): ImportRow[] {
  const records = csvRecords(text.replace(/^\uFEFF/, ''));
  if (records.length === 0) return [];
  const header = records[0].map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  const idx = {
    email: col('email address'), firstName: col('first name'), lastName: col('last name'),
    optinAt: col('optin_time'), confirmAt: col('confirm_time'),
  };
  if (idx.email < 0) return [];
  const cell = (r: string[], i: number): string => (i >= 0 ? (r[i] ?? '').trim() : '');
  return records.slice(1)
    .map((r) => ({
      email: cell(r, idx.email), firstName: cell(r, idx.firstName), lastName: cell(r, idx.lastName),
      optinAt: cell(r, idx.optinAt), confirmAt: cell(r, idx.confirmAt),
    }))
    .filter((r) => r.email !== '');
}
