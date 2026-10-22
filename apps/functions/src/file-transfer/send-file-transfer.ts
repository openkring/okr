import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import {
  AppConfig, AppConfigCollection, DeliveryChannel, FileTransferCollection, FileTransferEventCollection, FileTransferEventModel, FileTransferModel,
  FileTransferRecipient, UserModel,
} from '@okr/shared-models';
import { isKioskOnly } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import {
  checkFileTransferRequest, openBytes, resolveFileTransferLimits, SendFileTransferRequest, SendFileTransferResponse,
} from '@okr/content-file-transfer-util';

import { privateBucket } from '../_storage/private-bucket';
import { appBaseUrl } from '../alias/tenant-domains';
import { getAppEmailConfig } from '../auth/email-templates';
import { DEFAULT_EMAIL_PROVIDER, sendEmailViaProvider } from '../auth/email-transport';
import {
  activeGroupMemberKeys, getJoinedMemberIds, matrixAdminToken, resolveGroupRoom, resolvePersonDisplayName, serverHostname,
} from '../matrix-simple/shared';
import { pushToPersons } from '../srv/push';
import { createFirestoreDeps } from '../workflow/firestore-deps';
import { matrixBotToken, postGroupChatMessage } from '../workflow/matrix-bot';
import {
  fileTransferCardContent, fileTransferEmail, mayPostCard, PersonCandidate, planNotifications, recipientsForSend,
} from './file-transfer-notify';
import { hashPassword, hashToken, newToken } from './file-transfer-tokens';

const CF_NAME = 'sendFileTransfer';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GROUPS = 50;
const MAX_PERSONS = 1000;
const MAX_EMAILS = 100;          // the tenant limit (maxExternalRecipients) is checked separately
const MAX_MESSAGE = 2000;
const MAX_PASSWORD = 200;
/** Parallel person lookups and mails — bounded so a big group does not fan out unbounded. */
const CONCURRENCY = 16;

/** Same list the workflow outbox binds: every provider's credentials, the tenant picks one. */
const EMAIL_SECRETS = ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS'];

/** Plain object FirestoreService would write: class fields minus `okey` (the document id). */
function stripKey<T extends { okey: string }>(model: T): Omit<T, 'okey'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { okey, ...data } = model;
  return { ...data };
}

function invalid(message: string): HttpsError {
  return new HttpsError('invalid-argument', message);
}

function stringArray(value: unknown, max: number, name: string): string[] {
  if (!Array.isArray(value) || value.length > max || !value.every(v => typeof v === 'string' && v.length <= 320)) throw invalid(name);
  return [...new Set((value as string[]).map(v => v.trim()).filter(Boolean))];
}

/** Shape check of the untrusted payload; throws invalid-argument. */
function parseRequest(data: unknown): SendFileTransferRequest {
  const d = (data ?? {}) as Partial<SendFileTransferRequest>;
  if (typeof d.transferKey !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(d.transferKey)) throw invalid('transferKey');
  const message = d.message ?? '';
  const password = d.password ?? '';
  const chatRoomId = d.chatRoomId ?? '';
  if (typeof message !== 'string' || message.length > MAX_MESSAGE) throw invalid('message');
  if (typeof password !== 'string' || password.length > MAX_PASSWORD) throw invalid('password');
  if (typeof chatRoomId !== 'string' || (chatRoomId !== '' && !/^![^\s/]{1,255}$/.test(chatRoomId))) throw invalid('chatRoomId');
  return {
    transferKey: d.transferKey,
    groupKeys: stringArray(d.groupKeys ?? [], MAX_GROUPS, 'groupKeys'),
    personKeys: stringArray(d.personKeys ?? [], MAX_PERSONS, 'personKeys'),
    emails: stringArray(d.emails ?? [], MAX_EMAILS, 'emails'),
    message: message.trim(),
    password,
    chatRoomId,
  };
}

/** Runs `fn` over `items` with at most CONCURRENCY in flight; keeps the input order. */
async function mapBounded<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function matrixUserId(personKey: string): string {
  return `@${personKey.toLowerCase()}:${serverHostname()}`;
}

/** A room that may receive the card: a recipient group's room or the group room the send started in. */
interface CardTarget { groupKey: string; postPolicy: string | undefined; roomId?: string }

/** Personal link — the direct token url; it exists only in the notification (see file-transfer-notify.ts). */
function personalLink(baseUrl: string, token: string): string {
  return `${baseUrl}/public/file-transfer/${token}`;
}

/**
 * Quick file transfer, step 2 (spec 1.115 §4.1/§4.2): checks the uploads, resolves the recipients
 * (group members snapshotted now), re-checks the limits with the REAL recipient counts, creates one
 * personal token per recipient (only its hash is stored), opens the transfer and notifies.
 *
 * Recipient groups: ANY group of the tenant may be chosen — the user decided that every registered
 * user may send to groups; the limits (§4.4) and the admin monitoring view (§4.6) cover abuse. What
 * is restricted is the CARD in a group's room: it is posted only where the sender could post
 * themself (`mayPostCard`); otherwise that group's members get personal notifications.
 *
 * Notification is best-effort and happens after the commit: a failing mail provider or homeserver
 * must not leave the transfer stuck in 'uploading'.
 */
export const sendFileTransfer = onCall<unknown, Promise<SendFileTransferResponse>>(
  {
    region: 'europe-west6', enforceAppCheck: true, cors: true, timeoutSeconds: 300,
    secrets: [...EMAIL_SECRETS, matrixAdminToken, matrixBotToken],
  },
  async (request) => {
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);
    const tenantId = await getCallerTenantId(request, CF_NAME);
    const uid = request.auth?.uid ?? '';
    const req = parseRequest(request.data);
    const db = getFirestore();

    // ── caller ────────────────────────────────────────────────────────────────────────────
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) throw new HttpsError('permission-denied', 'No user profile.');
    const user = userSnap.data() as Partial<UserModel>;
    const personKey = user.personKey;
    if (!personKey) throw new HttpsError('failed-precondition', 'User profile has no linked person.');
    if (user.roles?.registered !== true || isKioskOnly(user as UserModel)) {
      throw new HttpsError('permission-denied', 'Registered users only.');
    }

    // ── transfer ──────────────────────────────────────────────────────────────────────────
    const ref = db.collection(FileTransferCollection).doc(req.transferKey);
    const snap = await ref.get();
    const stored = snap.data() as Partial<FileTransferModel> | undefined;
    // 'not-found' for a foreign tenant too: confirming the key exists elsewhere is a disclosure.
    if (!snap.exists || !stored?.tenants?.includes(tenantId)) throw new HttpsError('not-found', 'Transfer not found.');
    if (stored.senderKey !== personKey) throw new HttpsError('permission-denied', 'Only the sender may send this transfer.');
    if (stored.state !== 'uploading') throw new HttpsError('failed-precondition', 'notUploading');
    const transfer = { ...new FileTransferModel(tenantId), ...stored, okey: req.transferKey } as FileTransferModel;

    // Every file must be in the bucket with exactly the declared size (the upload session was
    // bound to it, this is the server-side proof that the upload completed).
    await Promise.all(transfer.files.map(async f => {
      let size = -1;
      try {
        const [meta] = await privateBucket().file(f.path).getMetadata();
        size = Number(meta.size);
      } catch {
        // missing object → size stays -1
      }
      if (size !== f.size) throw new HttpsError('failed-precondition', 'uploadIncomplete');
    }));
    const files = transfer.files.map(f => ({ ...f, uploaded: true }));

    // ── groups (any group of the tenant, see above) ───────────────────────────────────────
    const groupDocs = await Promise.all(req.groupKeys.map(async groupKey => {
      const g = (await db.collection('groups').doc(groupKey).get()).data();
      if (!g || g['isArchived'] === true || !((g['tenants'] as string[] | undefined) ?? []).includes(tenantId)) throw invalid('groupKeys');
      return { groupKey, hasChat: g['hasChat'] !== false, postPolicy: g['postPolicy'] as string | undefined, members: await activeGroupMemberKeys(groupKey) };
    }));

    // The room the send started in counts only if it is a GROUP room of this tenant (never a DM
    // or an ad-hoc room the bot would otherwise be joined into); else it is ignored.
    let chatRoomGroup: CardTarget | undefined;
    if (req.chatRoomId) {
      const found = await db.collection('groups').where('matrixRoomId', '==', req.chatRoomId).get();
      const g = found.docs.find(d => d.data()['isArchived'] !== true && d.data()['hasChat'] !== false
        && ((d.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId));
      if (g) chatRoomGroup = { groupKey: g.id, postPolicy: g.data()['postPolicy'] as string | undefined, roomId: req.chatRoomId };
      else logger.info(`${CF_NAME}: chatRoomId of ${req.transferKey} is not a group room of ${tenantId} — ignored`);
    }

    // ── recipients ────────────────────────────────────────────────────────────────────────
    const wanted: { personKey: string; viaGroupKey?: string }[] = [
      ...req.personKeys.map(k => ({ personKey: k })),
      ...groupDocs.flatMap(g => g.members.map(k => ({ personKey: k, viaGroupKey: g.groupKey }))),
    ].filter(w => w.personKey !== personKey);   // the sender does not notify themself

    // One lookup per distinct person: tenant check, name, channels and email. The email stays
    // server-side: it is never stored or returned, only used to send (and to send one mail when an
    // outside address equals it — see recipientsForSend / planNotifications for the oracle).
    const deps = createFirestoreDeps();
    const distinct = [...new Set(wanted.map(w => w.personKey))];
    const looked = await mapBounded(distinct, async key => {
      const p = (await db.collection('persons').doc(key).get()).data();
      if (!p || p['isArchived'] === true || !((p['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return undefined;
      const [channels, email] = await Promise.all([deps.deliveryChannelsFor(key, tenantId, 'news'), deps.emailFor(key, tenantId)]);
      const name = [p['firstName'], p['lastName']].filter(Boolean).join(' ').trim();
      return { personKey: key, name, email, channels };
    });
    const byKey = new Map(looked.filter((p): p is Omit<PersonCandidate, 'viaGroupKey'> => !!p).map(p => [p.personKey, p]));
    // Directly chosen persons must belong to this tenant; group members outside it are skipped.
    if (req.personKeys.some(k => k !== personKey && !byKey.has(k))) throw invalid('personKeys');
    const persons: PersonCandidate[] = wanted.flatMap(w => {
      const p = byKey.get(w.personKey);
      return p ? [{ ...p, viaGroupKey: w.viaGroupKey }] : [];
    });
    const built = recipientsForSend(persons, req.emails);

    // ── limits, re-checked with the real counts (the client's recipientCount is not trusted) ──
    const config = (await db.collection(AppConfigCollection).doc(tenantId).get()).data() as Partial<AppConfig> | undefined;
    const limits = resolveFileTransferLimits(config?.fileTransferLimits, personKey);
    const mine = await db.collection(FileTransferCollection).where('senderKey', '==', personKey).get();
    const otherOpen = openBytes(mine.docs
      .filter(d => d.id !== req.transferKey)
      .map(d => d.data() as Pick<FileTransferModel, 'state' | 'totalBytes'> & { tenants?: string[] })
      .filter(t => t.tenants?.includes(tenantId)));
    const lifetimeDays = Math.round((new Date(transfer.expiresAt).getTime() - new Date(transfer.createdAt).getTime()) / DAY_MS);
    const rejection = checkFileTransferRequest({
      totalBytes: transfer.totalBytes,
      fileCount: files.length,
      externalCount: built.filter(r => r.kind === 'email').length,
      recipientCount: built.filter(r => r.kind === 'person').length,
      lifetimeDays,
      emails: req.emails,
    }, limits, otherOpen);
    if (rejection) throw new HttpsError('failed-precondition', rejection);

    // ── personal tokens: kept in memory for the notifications, only the hash is stored ────
    const baseUrl = await appBaseUrl(tenantId);
    const tokens = new Map<string, string>();
    const recipients: FileTransferRecipient[] = built.map(r => {
      const token = newToken();
      tokens.set(r.id, token);
      return { ...r, tokenHash: hashToken(token), aliasUrl: '' };
    });

    transfer.senderName = (await resolvePersonDisplayName(personKey)) ?? '';
    transfer.message = req.message;
    transfer.files = files;
    transfer.groupKeys = req.groupKeys;
    transfer.chatRoomId = chatRoomGroup ? req.chatRoomId : '';
    transfer.recipients = recipients;
    transfer.recipientPersonKeys = recipients.filter(r => r.kind === 'person').map(r => r.personKey);
    transfer.tokenHashes = recipients.map(r => r.tokenHash);
    transfer.passwordHash = req.password ? await hashPassword(req.password) : '';
    transfer.state = 'open';

    // ── commit: only one send wins (state re-checked inside the transaction) ──────────────
    const now = new Date();
    await db.runTransaction(async tx => {
      const fresh = await tx.get(ref);
      if (fresh.data()?.['state'] !== 'uploading') throw new HttpsError('failed-precondition', 'notUploading');
      tx.update(ref, {
        senderName: transfer.senderName, message: transfer.message, files: transfer.files, groupKeys: transfer.groupKeys,
        chatRoomId: transfer.chatRoomId, recipients: transfer.recipients, recipientPersonKeys: transfer.recipientPersonKeys,
        tokenHashes: transfer.tokenHashes, passwordHash: transfer.passwordHash, state: transfer.state,
      });
      for (const r of recipients) {
        const event = new FileTransferEventModel(tenantId);
        event.transferKey = req.transferKey;
        event.senderKey = personKey;
        event.type = 'sent';
        event.recipientId = r.id;
        event.actorKey = personKey;
        event.at = now.toISOString();
        tx.create(db.collection(FileTransferEventCollection).doc(), stripKey(event));
      }
    });

    // ── notify (best effort) ──────────────────────────────────────────────────────────────
    const targets: CardTarget[] = [
      ...(chatRoomGroup ? [chatRoomGroup] : []),
      ...groupDocs.filter(g => g.hasChat).map(g => ({ groupKey: g.groupKey, postPolicy: g.postPolicy })),
    ];
    const covered = targets.length > 0
      ? await postCards(transfer, targets, personKey, user.roles ?? {}, baseUrl)
      : new Set<string>();
    const notified = await notifyRecipients(transfer, recipients, tokens, byKey, covered, tenantId, baseUrl);

    logger.info(`${CF_NAME}: sent ${req.transferKey} (tenant ${tenantId})`, { recipients: recipients.length, notified });
    return { recipients: recipients.length, notified };
  },
);

/**
 * One card per room, only where `mayPostCard` allows it. Returns the person keys a posted card
 * reaches (the room's joined members) — their chat channel is served by the card, so they get no
 * extra push (spec §4.2: «instead of one message per member»). A refused or failed card leaves
 * the group's members to the personal notifications.
 */
async function postCards(
  transfer: FileTransferModel,
  targets: CardTarget[],
  senderKey: string,
  senderRoles: Record<string, boolean>,
  baseUrl: string,
): Promise<Set<string>> {
  const adminToken = matrixAdminToken.value();
  const covered = new Set<string>();
  const { body, ...extra } = fileTransferCardContent(transfer, `${baseUrl}/private/file-transfer/${transfer.okey}`);
  const done = new Set<string>();

  for (const target of targets) {
    try {
      const roomId = target.roomId ?? await resolveGroupRoom(target.groupKey, serverHostname(), adminToken);
      if (!roomId || done.has(roomId)) continue;
      done.add(roomId);
      const joined = await getJoinedMemberIds(roomId, adminToken);
      if (!mayPostCard({ senderJoined: joined.has(matrixUserId(senderKey)), postPolicy: target.postPolicy, senderRoles })) {
        logger.info(`${CF_NAME}: no card for ${transfer.okey} in the room of ${target.groupKey} (sender may not post there)`);
        continue;
      }
      // txnId per (transfer, room): a retried call is deduplicated by Synapse
      await postGroupChatMessage(roomId, body, `file-transfer.${transfer.okey}.${roomId}`, adminToken, extra);
      for (const r of transfer.recipients) {
        if (r.kind === 'person' && joined.has(matrixUserId(r.personKey))) covered.add(r.personKey);
      }
    } catch (error) {
      logger.warn(`${CF_NAME}: card for ${transfer.okey} in the room of ${target.groupKey} failed`, { error: String(error) });
    }
  }
  return covered;
}

/**
 * Personal notifications as decided by `planNotifications`: email with the personal token link,
 * FCM push (as calendar `notifyPersons` does) opening `/private/file-transfer/<key>` — the push
 * payload never carries a token.
 */
async function notifyRecipients(
  transfer: FileTransferModel,
  recipients: FileTransferRecipient[],
  tokens: Map<string, string>,
  persons: Map<string, { channels: DeliveryChannel[]; email: string }>,
  covered: Set<string>,
  tenantId: string,
  baseUrl: string,
): Promise<number> {
  const cfg = (await getFirestore().collection(AppConfigCollection).doc(tenantId).get()).data();
  const provider = String(cfg?.['emailProvider'] ?? DEFAULT_EMAIL_PROVIDER);
  const appName = String(cfg?.['appName'] ?? '');
  const channels = new Map([...persons].map(([k, p]) => [k, p.channels]));
  const emails = new Map([...persons].map(([k, p]) => [k, p.email]));
  const plan = planNotifications(recipients, channels, emails, covered);
  const reached = new Set<string>(plan.coveredIds);

  if (plan.mails.length > 0) {
    const mailFrom = (await getAppEmailConfig(tenantId)).from;
    await mapBounded(plan.mails, async m => {
      try {
        const { subject, html } = fileTransferEmail(transfer, personalLink(baseUrl, tokens.get(m.recipientId) ?? ''), appName);
        await sendEmailViaProvider(provider, { from: mailFrom, to: [m.to], subject, html });
        reached.add(m.recipientId);
        m.alsoReaches.forEach(id => reached.add(id));
      } catch (error) {
        // no address in the log (PII)
        logger.warn(`${CF_NAME}: email to one recipient of ${transfer.okey} failed`, { error: String(error) });
      }
    });
  }

  if (plan.pushKeys.length > 0) {
    try {
      const count = transfer.files.length;
      await pushToPersons(plan.pushKeys, {
        type: 'file-transfer',
        tenantId,
        title: transfer.senderName,
        body: count === 1 ? 'hat dir 1 Datei geschickt' : `hat dir ${count} Dateien geschickt`,
        url: `/private/file-transfer/${transfer.okey}`,
        channelId: `file-transfer.${transfer.okey}`,
      }, CF_NAME);
      const pushed = new Set(plan.pushKeys);
      for (const r of recipients) if (r.kind === 'person' && pushed.has(r.personKey)) reached.add(r.id);
    } catch (error) {
      logger.warn(`${CF_NAME}: push for ${transfer.okey} failed`, { error: String(error) });
    }
  }
  return reached.size;
}
