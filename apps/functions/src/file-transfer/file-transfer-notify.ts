import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { AliasSpaceCollection, AliasSpaceModel } from '@okr/shared-models';
import type { FileTransferModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, removeKeyFromOkrModel } from '@okr/shared-util-core';

import { escapeHtml } from '../calendar/mail';
import { loadSpace } from '../alias/mint-alias';

/** Alias space of the personal transfer links (`/s/file-transfer/<code>`). */
export const TRANSFER_ALIAS_SPACE = 'file-transfer';

/** gRPC ALREADY_EXISTS — a concurrent first send created the space a moment earlier. */
const ALREADY_EXISTS = 6;

/**
 * Length of a personal link code. The code is a bearer secret (it redirects to the token URL),
 * so it is longer than the 6 of a printed short link: 12 × base32 ≈ 60 bits.
 */
const TRANSFER_ALIAS_LENGTH = 12;

/**
 * The tenant's `file-transfer` alias space, created on first use. The document id is
 * deterministic, so two concurrent first sends create it once (`.create()` + ALREADY_EXISTS).
 */
export async function ensureFileTransferAliasSpace(db: Firestore, tenantId: string): Promise<AliasSpaceModel> {
  try {
    return await loadSpace(db, tenantId, TRANSFER_ALIAS_SPACE);
  } catch (err) {
    if (!(err instanceof HttpsError) || err.code !== 'not-found') throw err;
  }
  const space = new AliasSpaceModel(tenantId);
  space.name = TRANSFER_ALIAS_SPACE;
  space.label = TRANSFER_ALIAS_SPACE;
  space.kind = 'redirect';
  space.length = TRANSFER_ALIAS_LENGTH;
  space.targetTypes = ['url'];
  space.roleNeeded = 'registered';
  space.trackingLevel = 'off';      // opens/downloads are logged as file-transfer-events instead
  space.defaultValidDays = 30;
  const id = `${tenantId}_${TRANSFER_ALIAS_SPACE}`;
  try {
    await db.collection(AliasSpaceCollection).doc(id).create(removeKeyFromOkrModel(space));
  } catch (err) {
    if ((err as { code?: number }).code !== ALREADY_EXISTS) throw err;
  }
  return loadSpace(db, tenantId, TRANSFER_ALIAS_SPACE);
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
