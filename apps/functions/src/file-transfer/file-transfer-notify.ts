import { DeliveryChannel } from '@okr/shared-models';
import type { FileTransferModel, FileTransferRecipient, UserModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, hasRole } from '@okr/shared-util-core';
import { buildRecipients } from '@okr/content-file-transfer-util';

import { escapeHtml } from '../calendar/mail';

/*
 * Links in a notification (spec 1.115 §4.2): a MEMBER (person recipient) gets the private page
 * `<appBaseUrl>/private/file-transfer/<transferKey>` — no token, they open it signed in and never
 * need the transfer password. Only an OUTSIDE address gets a personal token link.
 *
 * Personal token links are the DIRECT url `<appBaseUrl>/public/file-transfer/<token>`,
 * not an alias-service short link (deviation from the plan, fix round 1 of Task 4): alias docs are
 * readable tenant-wide (`aliases`: `allow read: if tenantRead()`) and their `targetUrl` would expose
 * the bearer token to every member. The url therefore exists only inside the notification itself;
 * Firestore holds `tokenHash` only and `recipients[].aliasUrl` stays ''.
 */

/** A person candidate as `sendFileTransfer` resolves it. `email` is server-side only (never stored). */
export interface PersonCandidate {
  personKey: string;
  name: string;
  email: string;
  viaGroupKey?: string;
  channels: DeliveryChannel[];
}

/**
 * Recipients for a send — exactly what the sender entered.
 *
 * Persons go in with their email BLANKED, so an outside address that equals a member's address
 * stays its own `e:<email>` recipient with its own token. Merging it (what `buildRecipients` does
 * when given the address) would be a membership/email ORACLE: the sender reads the stored transfer
 * and the returned counts, sees a member's name where they typed an address, and learns who owns
 * it — while member addresses are protected PII (privacy-model: addresses are a vault). For the
 * same reason a person recipient never carries `email` in the stored doc. The duplicate mail is
 * suppressed internally only, in `planNotifications`.
 */
export function recipientsForSend(persons: PersonCandidate[], emails: string[]): Omit<FileTransferRecipient, 'tokenHash' | 'aliasUrl'>[] {
  return buildRecipients({ persons: persons.map(p => ({ ...p, email: '' })), emails });
}

/**
 * May the bot post the transfer card into a group's room on the sender's behalf? Only where the
 * sender could post themself: they are a joined member of the room AND the group's `postPolicy`
 * lets them write (`'all'`, or tenant `privileged`/`admin` for `'privileged'`). Group admins
 * (`group.admins[]`) deliberately do NOT count — the `group` skill / participant-messaging spec
 * §3.2b: broadcast rights live in `users.roles` only.
 */
export function mayPostCard(p: { senderJoined: boolean; postPolicy: string | undefined; senderRoles: Record<string, boolean> | undefined }): boolean {
  if (!p.senderJoined) return false;
  if ((p.postPolicy ?? 'all') === 'all') return true;
  return hasRole('privileged', { roles: p.senderRoles ?? {} } as UserModel);
}

export interface PlannedMail {
  /** the recipient the mail is addressed to */
  recipientId: string;
  /** 'member': the private page (no token); 'token': the recipient's personal token link */
  link: 'member' | 'token';
  to: string;
  /** further recipients this one mail also reaches (an outside address equal to the person's) */
  alsoReaches: string[];
}

export interface NotificationPlan {
  mails: PlannedMail[];
  /** person keys to push (chat channel, not reached by a card) */
  pushKeys: string[];
  /** recipient ids reached by a posted card */
  coveredIds: string[];
}

/**
 * Who gets what. A person whose chat channel is served by a posted card gets no push; email is
 * independent of the card. 'signal' is skipped (no Signal send path in the functions yet, spec
 * 1.113), 'post' is ignored for transfers.
 *
 * A person's mail carries the private member link, an outside address's mail its token link.
 *
 * `emailByPerson` holds the members' addresses server-side (never stored, never returned). If an
 * outside address equals the address of a person who is mailed anyway, the address belongs to that
 * member: only ONE mail goes out — with the member's private link — and it counts for both
 * recipients, so neither the stored doc nor the returned counts reveal the match (see
 * `recipientsForSend`).
 */
export function planNotifications(
  recipients: Pick<FileTransferRecipient, 'id' | 'kind' | 'personKey' | 'email'>[],
  channelsByPerson: Map<string, DeliveryChannel[]>,
  emailByPerson: Map<string, string>,
  coveredPersonKeys: Set<string>,
): NotificationPlan {
  const plan: NotificationPlan = { mails: [], pushKeys: [], coveredIds: [] };
  const personMailByAddress = new Map<string, PlannedMail>();
  for (const r of recipients) {
    if (r.kind !== 'person') continue;
    const channels = channelsByPerson.get(r.personKey) ?? [];
    const to = (emailByPerson.get(r.personKey) ?? '').trim();
    if (to && channels.includes(DeliveryChannel.Email)) {
      const mail: PlannedMail = { recipientId: r.id, link: 'member', to, alsoReaches: [] };
      plan.mails.push(mail);
      if (!personMailByAddress.has(to.toLowerCase())) personMailByAddress.set(to.toLowerCase(), mail);
    }
    if (coveredPersonKeys.has(r.personKey)) plan.coveredIds.push(r.id);
    else if (channels.includes(DeliveryChannel.Chat)) plan.pushKeys.push(r.personKey);
  }
  for (const r of recipients) {
    if (r.kind !== 'email' || !r.email) continue;
    const same = personMailByAddress.get(r.email.trim().toLowerCase());
    if (same) same.alsoReaches.push(r.id);
    else plan.mails.push({ recipientId: r.id, link: 'token', to: r.email, alsoReaches: [] });
  }
  return plan;
}

/** The link a planned mail carries: the member's private page, or the outside recipient's token link. */
export function notificationLink(baseUrl: string, transferKey: string, mail: Pick<PlannedMail, 'link'>, token: string): string {
  return mail.link === 'member'
    ? `${baseUrl}/private/file-transfer/${transferKey}`
    : `${baseUrl}/public/file-transfer/${token}`;
}

function fileCountLabel(n: number): string {
  return n === 1 ? '1 Datei' : `${n} Dateien`;
}

/** Expiry as dd.MM.yyyy (the UTC calendar day — conservative by at most one day). */
export function fileTransferExpiryLabel(expiresAt: string): string {
  return convertDateFormatToString((expiresAt ?? '').slice(0, 10), DateFormat.IsoDate, DateFormat.ViewDate, false);
}

/**
 * The transfer card posted into a chat room: an `m.text` whose content carries the transfer key
 * in `org.okr.fileTransfer`, so the app renders a card; other clients show the readable body.
 * The body holds no message text — the room may not be end-to-end encrypted for the bot.
 */
export function fileTransferCardContent(t: FileTransferModel, link: string): { body: string; 'org.okr.fileTransfer': { transferKey: string } } {
  const expiry = fileTransferExpiryLabel(t.expiresAt);
  const until = expiry ? ` (bis ${expiry})` : '';
  return {
    body: `${t.senderName} hat ${fileCountLabel(t.files.length)} geteilt${until}: ${link}`,
    'org.okr.fileTransfer': { transferKey: t.okey },
  };
}

/** Escaped, with line breaks kept. */
function paragraphText(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

/**
 * Email with a link — German, du-form, plain. `member`: the link opens the app page and needs a
 * sign-in (no password); otherwise it is the outside recipient's personal link.
 */
export function fileTransferEmail(t: FileTransferModel, link: string, appName: string, member = false): { subject: string; html: string } {
  const sender = t.senderName || appName;
  const subject = `${sender} hat dir Dateien geschickt`;
  const message = t.message.trim()
    ? `<p style="margin:16px 0;padding:12px 16px;border-left:3px solid #d0d7de;">${paragraphText(t.message.trim())}</p>`
    : '';
  const expiry = fileTransferExpiryLabel(t.expiresAt);
  const until = expiry ? `<p>Der Link ist bis am ${escapeHtml(expiry)} gültig.</p>` : '';
  const signIn = member ? `<p>Der Link öffnet die Dateien in der App, sobald du angemeldet bist.</p>` : '';
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`
    + '<body style="margin:0;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328;line-height:1.5;">'
    + '<div style="max-width:560px;margin:0 auto;">'
    + `<p>Hallo</p>`
    + `<p>${escapeHtml(sender)} hat dir ${fileCountLabel(t.files.length)} geschickt.</p>`
    + message
    + `<p><a href="${escapeHtml(link)}">Dateien ansehen</a></p>`
    + `<p style="color:#57606a;font-size:13px;">${escapeHtml(link)}</p>`
    + signIn
    + until
    + `<p>Freundliche Grüsse<br>${escapeHtml(appName)}</p>`
    + '</div></body></html>';
  return { subject, html };
}
