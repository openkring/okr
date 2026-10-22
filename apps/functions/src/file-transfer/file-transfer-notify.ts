import { DeliveryChannel } from '@okr/shared-models';
import type { FileTransferModel, FileTransferRecipient, UserModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, hasRole } from '@okr/shared-util-core';
import { buildRecipients } from '@okr/content-file-transfer-util';

import { escapeHtml } from '../calendar/mail';

/*
 * Personal links (spec 1.115 §4.2) are the DIRECT url `<appBaseUrl>/public/file-transfer/<token>`,
 * not an alias-service short link (deviation from the plan, fix round 1 of Task 4): alias docs are
 * readable tenant-wide (`aliases`: `allow read: if tenantRead()`) and their `targetUrl` would expose
 * the bearer token to every member. The url therefore exists only inside the notification itself;
 * Firestore holds `tokenHash` only and `recipients[].aliasUrl` stays ''.
 */

/** A person candidate as `sendFileTransfer` resolves it: email always looked up (for dedupe). */
export interface PersonCandidate {
  personKey: string;
  name: string;
  email: string;
  viaGroupKey?: string;
  channels: DeliveryChannel[];
}

/**
 * Recipients for a send. The person's email is passed to `buildRecipients` regardless of the
 * channel, so an outside address equal to a member's address merges into that person; it is then
 * cleared again for persons who do not want email, so the transfer doc does not keep it.
 */
export function recipientsForSend(persons: PersonCandidate[], emails: string[]): Omit<FileTransferRecipient, 'tokenHash' | 'aliasUrl'>[] {
  const wantsEmail = new Map(persons.map(p => [p.personKey, p.channels.includes(DeliveryChannel.Email)]));
  return buildRecipients({ persons, emails }).map(r => (r.kind === 'person' && !wantsEmail.get(r.personKey) ? { ...r, email: '' } : r));
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

export interface NotificationPlan {
  /** recipient ids to email (persons with the email channel and an address, all outside addresses) */
  emailIds: string[];
  /** person keys to push (chat channel, not reached by a card) */
  pushKeys: string[];
  /** recipient ids reached by a posted card */
  coveredIds: string[];
}

/**
 * Who gets what. A person whose chat channel is served by a posted card gets no push; email is
 * independent of the card. 'signal' is skipped (no Signal send path in the functions yet, spec
 * 1.113), 'post' is ignored for transfers.
 */
export function planNotifications(
  recipients: Pick<FileTransferRecipient, 'id' | 'kind' | 'personKey' | 'email'>[],
  channelsByPerson: Map<string, DeliveryChannel[]>,
  coveredPersonKeys: Set<string>,
): NotificationPlan {
  const plan: NotificationPlan = { emailIds: [], pushKeys: [], coveredIds: [] };
  for (const r of recipients) {
    if (r.kind === 'email') {
      if (r.email) plan.emailIds.push(r.id);
      continue;
    }
    const channels = channelsByPerson.get(r.personKey) ?? [];
    if (r.email && channels.includes(DeliveryChannel.Email)) plan.emailIds.push(r.id);
    if (coveredPersonKeys.has(r.personKey)) plan.coveredIds.push(r.id);
    else if (channels.includes(DeliveryChannel.Chat)) plan.pushKeys.push(r.personKey);
  }
  return plan;
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

/** Email with a personal link — German, du-form, plain. */
export function fileTransferEmail(t: FileTransferModel, link: string, appName: string): { subject: string; html: string } {
  const sender = t.senderName || appName;
  const subject = `${sender} hat dir Dateien geschickt`;
  const message = t.message.trim()
    ? `<p style="margin:16px 0;padding:12px 16px;border-left:3px solid #d0d7de;">${paragraphText(t.message.trim())}</p>`
    : '';
  const expiry = fileTransferExpiryLabel(t.expiresAt);
  const until = expiry ? `<p>Der Link ist bis am ${escapeHtml(expiry)} gültig.</p>` : '';
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`
    + '<body style="margin:0;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328;line-height:1.5;">'
    + '<div style="max-width:560px;margin:0 auto;">'
    + `<p>Hallo</p>`
    + `<p>${escapeHtml(sender)} hat dir ${fileCountLabel(t.files.length)} geschickt.</p>`
    + message
    + `<p><a href="${escapeHtml(link)}">Dateien ansehen</a></p>`
    + `<p style="color:#57606a;font-size:13px;">${escapeHtml(link)}</p>`
    + until
    + `<p>Freundliche Grüsse<br>${escapeHtml(appName)}</p>`
    + '</div></body></html>';
  return { subject, html };
}
