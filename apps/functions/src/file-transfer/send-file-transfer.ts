import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import {
  AppConfig, AppConfigCollection, DeliveryChannel, FileTransferCollection, FileTransferEventCollection, FileTransferEventModel, FileTransferModel,
  FileTransferRecipient, UserModel,
} from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getTodayStr, isKioskOnly } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import {
  buildRecipients, checkFileTransferRequest, openBytes, resolveFileTransferLimits, SendFileTransferRequest, SendFileTransferResponse,
} from '@okr/content-file-transfer-util';

import { privateBucket } from '../_storage/private-bucket';
import { assertMayMint, assertTargetAcceptable, mintAlias } from '../alias/mint-alias';
import { appBaseUrl, shortUrl } from '../alias/tenant-domains';
import { getAppEmailConfig } from '../auth/email-templates';
import { DEFAULT_EMAIL_PROVIDER, sendEmailViaProvider } from '../auth/email-transport';
import {
  activeGroupMemberKeys, getJoinedMemberIds, getRoomTenants, matrixAdminToken, resolveGroupRoom, resolvePersonDisplayName, roomAdmitsTenant,
  serverHostname,
} from '../matrix-simple/shared';
import { pushToPersons } from '../srv/push';
import { createFirestoreDeps } from '../workflow/firestore-deps';
import { matrixBotToken, postGroupChatMessage } from '../workflow/matrix-bot';
import { ensureFileTransferAliasSpace, fileTransferCardContent, fileTransferEmail } from './file-transfer-notify';
import { hashPassword, hashToken, newToken } from './file-transfer-tokens';

const CF_NAME = 'sendFileTransfer';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GROUPS = 50;
const MAX_PERSONS = 1000;
const MAX_EMAILS = 100;          // the tenant limit (maxExternalRecipients) is checked separately
const MAX_MESSAGE = 2000;
const MAX_PASSWORD = 200;
/** Parallel alias mints / person lookups — bounded so a big group does not fan out unbounded. */
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

interface PersonCandidate { personKey: string; name: string; email: string; viaGroupKey?: string; channels: DeliveryChannel[] }

/**
 * Quick file transfer, step 2 (spec 1.115 §4.1/§4.2): checks the uploads, resolves the recipients
 * (group members snapshotted now), re-checks the limits with the REAL recipient counts, mints one
 * personal link per recipient, opens the transfer and notifies.
 *
 * Notification is best-effort and happens after the commit: a failing mail provider or homeserver
 * must not leave the transfer stuck in 'uploading' after its links were minted.
 */
export const sendFileTransfer = onCall(
  {
    region: 'europe-west6', enforceAppCheck: true, cors: true, timeoutSeconds: 300,
    secrets: [...EMAIL_SECRETS, matrixAdminToken, matrixBotToken],
  },
  async (request: CallableRequest<unknown>): Promise<SendFileTransferResponse> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
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

    // ── chat room chosen by the sender: must be a room of this tenant the sender is IN ───
    // Otherwise any user could make the bot post into any room of the homeserver.
    const adminToken = req.chatRoomId || req.groupKeys.length > 0 ? matrixAdminToken.value() : '';
    let chatRoomMembers = new Set<string>();
    if (req.chatRoomId) {
      try {
        const [roomTenants, members] = await Promise.all([getRoomTenants(req.chatRoomId, adminToken), getJoinedMemberIds(req.chatRoomId, adminToken)]);
        if (!roomAdmitsTenant(roomTenants, [tenantId]) || !members.has(matrixUserId(personKey))) throw new Error('not admitted');
        chatRoomMembers = members;
      } catch (error) {
        logger.warn(`${CF_NAME}: chat room refused for ${req.transferKey}`, { error: String(error) });
        throw new HttpsError('not-found', 'Room not found.');
      }
    }

    // ── recipients ────────────────────────────────────────────────────────────────────────
    const groupDocs = await Promise.all(req.groupKeys.map(async groupKey => {
      const g = (await db.collection('groups').doc(groupKey).get()).data();
      if (!g || g['isArchived'] === true || !((g['tenants'] as string[] | undefined) ?? []).includes(tenantId)) throw invalid('groupKeys');
      return { groupKey, hasChat: g['hasChat'] !== false, members: await activeGroupMemberKeys(groupKey) };
    }));
    const wanted: { personKey: string; viaGroupKey?: string }[] = [
      ...req.personKeys.map(k => ({ personKey: k })),
      ...groupDocs.flatMap(g => g.members.map(k => ({ personKey: k, viaGroupKey: g.groupKey }))),
    ].filter(w => w.personKey !== personKey);   // the sender does not notify themself

    // One lookup per distinct person: tenant check, name, channels, email (only if mailed).
    const deps = createFirestoreDeps();
    const distinct = [...new Set(wanted.map(w => w.personKey))];
    const looked = await mapBounded(distinct, async key => {
      const p = (await db.collection('persons').doc(key).get()).data();
      if (!p || p['isArchived'] === true || !((p['tenants'] as string[] | undefined) ?? []).includes(tenantId)) return undefined;
      const channels = await deps.deliveryChannelsFor(key, tenantId, 'news');
      const email = channels.includes(DeliveryChannel.Email) ? await deps.emailFor(key, tenantId) : '';
      const name = [p['firstName'], p['lastName']].filter(Boolean).join(' ').trim() || String(p['name'] ?? '');
      return { personKey: key, name, email, channels };
    });
    const byKey = new Map(looked.filter((p): p is Omit<PersonCandidate, 'viaGroupKey'> => !!p).map(p => [p.personKey, p]));
    // Directly chosen persons must belong to this tenant; group members outside it are skipped.
    if (req.personKeys.some(k => k !== personKey && !byKey.has(k))) throw invalid('personKeys');
    const persons: PersonCandidate[] = wanted.flatMap(w => {
      const p = byKey.get(w.personKey);
      return p ? [{ ...p, viaGroupKey: w.viaGroupKey }] : [];
    });
    const built = buildRecipients({ persons, emails: req.emails });

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

    // ── personal links: token (only its hash is stored) → alias → /public/file-transfer/<token> ──
    const space = await ensureFileTransferAliasSpace(db, tenantId);
    assertMayMint(space, (user.roles ?? {}) as Record<string, boolean>);
    const baseUrl = await appBaseUrl(tenantId);
    const now = new Date();
    const validUntil = convertDateFormatToString(transfer.expiresAt.slice(0, 10), DateFormat.IsoDate, DateFormat.StoreDate, false);
    const mintedAt = getTodayStr(DateFormat.StoreDateTime);
    const recipients: FileTransferRecipient[] = await mapBounded(built, async (r, i) => {
      const token = newToken();
      const targetUrl = `${baseUrl}/public/file-transfer/${token}`;
      assertTargetAcceptable(space, 'url', targetUrl, '');
      const minted = await mintAlias(db, {
        tenantId, space, targetType: 'url', targetUrl, targetKey: '',
        // no recipient name/email here: the alias doc is readable tenant-wide
        original: `file-transfer/${req.transferKey}/${i}`,
        notes: '',
        createdBy: `person.${personKey}`,
        now: mintedAt,
        validUntil,
      });
      return { ...r, tokenHash: hashToken(token), aliasUrl: shortUrl(baseUrl, space.name, minted.alias) };
    });

    transfer.senderName = (await resolvePersonDisplayName(personKey)) ?? '';
    transfer.message = req.message;
    transfer.files = files;
    transfer.groupKeys = req.groupKeys;
    transfer.chatRoomId = req.chatRoomId;
    transfer.recipients = recipients;
    transfer.recipientPersonKeys = recipients.filter(r => r.kind === 'person').map(r => r.personKey);
    transfer.tokenHashes = recipients.map(r => r.tokenHash);
    transfer.passwordHash = req.password ? await hashPassword(req.password) : '';
    transfer.state = 'open';

    // ── commit: only one send wins (state re-checked inside the transaction) ──────────────
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
    const covered = await postCards(transfer, req, groupDocs, chatRoomMembers, baseUrl, adminToken);
    const notified = await notifyRecipients(transfer, recipients, byKey, covered, tenantId);

    logger.info(`${CF_NAME}: sent ${req.transferKey} (tenant ${tenantId})`, { recipients: recipients.length, notified });
    return { recipients: recipients.length, notified };
  },
);

/**
 * One card per room: the sender's chat room (if any) and every recipient group's room. Returns
 * the person keys a successfully posted card reaches — their chat channel is served by the card,
 * so they get no extra push (spec §4.2: «instead of one message per member»).
 */
async function postCards(
  transfer: FileTransferModel,
  req: SendFileTransferRequest,
  groups: { groupKey: string; hasChat: boolean; members: string[] }[],
  chatRoomMembers: Set<string>,
  baseUrl: string,
  adminToken: string,
): Promise<Set<string>> {
  const covered = new Set<string>();
  const card = fileTransferCardContent(transfer, `${baseUrl}/private/file-transfer/${transfer.okey}`);
  const { body, ...extra } = card;
  const posted = new Set<string>();

  const post = async (roomId: string): Promise<boolean> => {
    if (posted.has(roomId)) return true;
    try {
      // txnId per (transfer, room): a retried call is deduplicated by Synapse
      await postGroupChatMessage(roomId, body, `file-transfer.${transfer.okey}.${roomId}`, adminToken, extra);
      posted.add(roomId);
      return true;
    } catch (error) {
      logger.warn(`${CF_NAME}: card not posted to ${roomId} for ${transfer.okey}`, { error: String(error) });
      return false;
    }
  };

  if (req.chatRoomId && await post(req.chatRoomId)) {
    for (const r of transfer.recipients) {
      if (r.kind === 'person' && chatRoomMembers.has(matrixUserId(r.personKey))) covered.add(r.personKey);
    }
  }
  for (const g of groups.filter(x => x.hasChat)) {
    let roomId: string | undefined;
    try {
      roomId = await resolveGroupRoom(g.groupKey, serverHostname(), adminToken);
    } catch (error) {
      logger.warn(`${CF_NAME}: group room of ${g.groupKey} not resolved`, { error: String(error) });
    }
    if (roomId && await post(roomId)) g.members.forEach(k => covered.add(k));
  }
  return covered;
}

/**
 * Personal notifications. Persons: their `newsDelivery` channels — email with the personal link,
 * chat as an FCM push opening the transfer in the app (as calendar `notifyPersons` does), unless
 * a card already reached them. 'signal' is skipped: there is no Signal send path in the functions
 * yet (spec 1.113); 'post' is ignored for transfers. Outside addresses: email with their link.
 */
async function notifyRecipients(
  transfer: FileTransferModel,
  recipients: FileTransferRecipient[],
  persons: Map<string, { channels: DeliveryChannel[] }>,
  covered: Set<string>,
  tenantId: string,
): Promise<number> {
  const db = getFirestore();
  const cfg = (await db.collection(AppConfigCollection).doc(tenantId).get()).data();
  const provider = String(cfg?.['emailProvider'] ?? DEFAULT_EMAIL_PROVIDER);
  const appName = String(cfg?.['appName'] ?? '');
  const mailFrom = (await getAppEmailConfig(tenantId)).from;

  const reached = new Set<string>();
  const pushKeys: string[] = [];
  for (const r of recipients) {
    if (r.kind !== 'person') continue;
    if (covered.has(r.personKey)) reached.add(r.id);
    else if (persons.get(r.personKey)?.channels.includes(DeliveryChannel.Chat)) pushKeys.push(r.personKey);
  }

  const mailTo = recipients.filter(r => r.email && (r.kind === 'email' || persons.get(r.personKey)?.channels.includes(DeliveryChannel.Email)));
  await mapBounded(mailTo, async r => {
    try {
      const { subject, html } = fileTransferEmail(transfer, r.aliasUrl, appName);
      await sendEmailViaProvider(provider, { from: mailFrom, to: [r.email], subject, html });
      reached.add(r.id);
    } catch (error) {
      // no address in the log (PII)
      logger.warn(`${CF_NAME}: email to one recipient of ${transfer.okey} failed`, { error: String(error) });
    }
  });

  if (pushKeys.length > 0) {
    try {
      const count = transfer.files.length;
      await pushToPersons(pushKeys, {
        type: 'file-transfer',
        tenantId,
        title: transfer.senderName,
        body: count === 1 ? 'hat dir 1 Datei geschickt' : `hat dir ${count} Dateien geschickt`,
        url: `/private/file-transfer/${transfer.okey}`,
        channelId: `file-transfer.${transfer.okey}`,
      }, CF_NAME);
      for (const r of recipients) if (r.kind === 'person' && pushKeys.includes(r.personKey)) reached.add(r.id);
    } catch (error) {
      logger.warn(`${CF_NAME}: push for ${transfer.okey} failed`, { error: String(error) });
    }
  }
  return reached.size;
}
