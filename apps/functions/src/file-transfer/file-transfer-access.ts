import type { Firestore } from 'firebase-admin/firestore';

import { FileTransferCollection, FileTransferEventCollection, FileTransferEventModel, FileTransferModel } from '@okr/shared-models';
import type { FileTransferEventType } from '@okr/shared-models';
import { AccessFailure, FileTransferView, isFileTransferAccessible } from '@okr/content-file-transfer-util';

import { privateBucket } from '../_storage/private-bucket';
import { contentDisposition } from '../video/video-sign.util';
import { hashToken } from './file-transfer-tokens';

/**
 * Access to a quick file transfer (spec 1.115 §4.2): the public personal-link API
 * (`publicApi/routes/file-transfer.ts`) and the logged-in member callables
 * (`open-file-transfer.ts`). Every play/download URL is a short-lived signed URL issued here,
 * after the link (and password, if any) or the membership has been checked — which is also
 * where opens and downloads are logged. Events never carry an IP address.
 */

export type FileDisposition = 'inline' | 'attachment';

const URL_TTL_MS = 10 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

/** Public reads (GET view + POST file) per client IP. Generous: one recipient opens a few dozen files. */
export const PUBLIC_IP_LIMIT = { limit: 120, windowMs: WINDOW_MS };
/** Wrong passwords per personal link (key = tokenHash). */
export const PASSWORD_TOKEN_LIMIT = { limit: 5, windowMs: WINDOW_MS };
/** Wrong passwords per client IP across all links (spraying many tokens). */
export const PASSWORD_IP_LIMIT = { limit: 60, windowMs: WINDOW_MS };

/** Personal link tokens are 32 random bytes base64url (43 chars); anything far off is not looked up. */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const MAX_PASSWORD = 200;

/** The client-supplied contentType is unvalidated: only these may render in the browser. SVG can carry script. */
function mayRenderInline(contentType: string): boolean {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'image/svg+xml') return false;
  return type.startsWith('video/') || type.startsWith('image/') || type === 'application/pdf';
}

/** 'inline' only for playable/viewable types; everything else is forced to 'attachment'. */
export function effectiveDisposition(contentType: string, requested: FileDisposition): FileDisposition {
  return requested === 'inline' && mayRenderInline(contentType) ? 'inline' : 'attachment';
}

/** The public page's data — never paths, token hashes, the password hash, emails or other recipients. */
export function toFileTransferView(t: FileTransferModel, needsPassword: boolean): FileTransferView {
  return {
    transferKey: t.okey,
    senderName: t.senderName,
    message: t.message,
    expiresAt: t.expiresAt,
    needsPassword,
    files: t.files.map(f => ({ index: f.index, name: f.name, size: f.size, contentType: f.contentType })),
  };
}

/** v4 signed read URL, 10 minutes, with a Content-Disposition naming the original file. */
export async function issueFileUrl(t: FileTransferModel, fileIndex: number, disposition: FileDisposition): Promise<string> {
  const file = t.files.find(f => f.index === fileIndex);
  if (!file) throw new Error(`issueFileUrl: no file ${fileIndex} in ${t.okey}`);
  const effective = effectiveDisposition(file.contentType, disposition);
  const attachment = contentDisposition(file.name, file.path);
  const [url] = await privateBucket().file(file.path).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + URL_TTL_MS,
    responseDisposition: effective === 'inline' ? attachment.replace(/^attachment;/, 'inline;') : attachment,
    ...(effective === 'inline' ? { responseType: file.contentType } : {}),
  });
  return url;
}

/** Appends one event to the permanent log (a plain object: the Admin SDK rejects class instances). */
export async function logFileTransferEvent(db: Firestore, e: Omit<FileTransferEventModel, 'okey'>): Promise<void> {
  await db.collection(FileTransferEventCollection).add({ ...e });
}

/** The transfer a personal link belongs to — looked up by the token's hash only (single-field index). */
export async function findFileTransferByToken(db: Firestore, token: string): Promise<FileTransferModel | undefined> {
  const snap = await db.collection(FileTransferCollection)
    .where('tokenHashes', 'array-contains', hashToken(token))
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (snap.empty || !doc) return undefined;
  const data = doc.data() as Partial<FileTransferModel>;
  const tenantId = data.tenants?.[0] ?? '';
  return { ...new FileTransferModel(tenantId), ...data, okey: doc.id } as FileTransferModel;
}

function accessEvent(
  t: FileTransferModel, type: FileTransferEventType, recipientId: string, actorKey: string, fileIndex: number, at: string,
): Omit<FileTransferEventModel, 'okey'> {
  return { tenants: t.tenants, transferKey: t.okey, senderKey: t.senderKey, type, recipientId, actorKey, fileIndex, at };
}

/** `opened` for an inline view, `downloaded` for an attachment — by the disposition actually served. */
export function eventTypeFor(disposition: FileDisposition): FileTransferEventType {
  return disposition === 'inline' ? 'opened' : 'downloaded';
}

// ── public personal-link access ──────────────────────────────────────────────────────────────

export interface RateLimitOpts { limit: number; windowMs: number }

/** The I/O of the public handlers, injected so they are testable without Firestore/Storage. */
export interface PublicAccessDeps {
  findByToken(token: string): Promise<FileTransferModel | undefined>;
  /** true when `bucket:key` has used up its window (does not count) */
  peekLimit(bucket: string, key: string, opts: RateLimitOpts): Promise<boolean>;
  /** counts one hit; false when the window is used up */
  hitLimit(bucket: string, key: string, opts: RateLimitOpts): Promise<boolean>;
  checkPassword(password: string, stored: string): Promise<boolean>;
  issueFileUrl(t: FileTransferModel, fileIndex: number, disposition: FileDisposition): Promise<string>;
  logEvent(e: Omit<FileTransferEventModel, 'okey'>): Promise<void>;
  now(): string;
}

export type AccessErrorCode = AccessFailure | 'badRequest';
export interface AccessResult<T> { status: number; body: T | { error: { code: AccessErrorCode } } }

const STATUS: Record<AccessErrorCode, number> = { notFound: 404, expired: 410, wrongPassword: 401, rateLimited: 429, badRequest: 400 };

function fail<T>(code: AccessErrorCode): AccessResult<T> {
  return { status: STATUS[code], body: { error: { code } } };
}

type Resolved = { ok: true; t: FileTransferModel; recipientId: string; tokenHash: string } | { ok: false; code: AccessErrorCode };

/** Per-IP limit, token shape, lookup, recipient and lifetime — shared by GET and POST. */
async function resolveLink(token: string, ip: string, deps: PublicAccessDeps): Promise<Resolved> {
  if (!(await deps.hitLimit('transferIp', ip, PUBLIC_IP_LIMIT))) return { ok: false, code: 'rateLimited' };
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { ok: false, code: 'notFound' };
  const t = await deps.findByToken(token);
  const tokenHash = hashToken(token);
  const recipient = t?.recipients.find(r => r.tokenHash === tokenHash);
  if (!t || !recipient || t.state === 'uploading') return { ok: false, code: 'notFound' };
  if (!isFileTransferAccessible(t, deps.now())) return { ok: false, code: 'expired' };
  return { ok: true, t, recipientId: recipient.id, tokenHash };
}

/** GET /public/api/v1/file-transfer/:token */
export async function publicView(token: string, ip: string, deps: PublicAccessDeps): Promise<AccessResult<FileTransferView>> {
  const link = await resolveLink(token, ip, deps);
  if (!link.ok) return fail(link.code);
  return { status: 200, body: toFileTransferView(link.t, !!link.t.passwordHash) };
}

/**
 * POST /public/api/v1/file-transfer/:token/file {fileIndex, disposition, password?}
 *
 * Wrong passwords are limited per link (5 / 15 min, bucket `transferPw`, key = tokenHash) and per
 * client IP (60 / 15 min, bucket `transferPwIp`). Only FAILURES count — a recipient opening many
 * files with the right password is not throttled — so the buckets are peeked BEFORE checking the
 * password: once exhausted, even the right password gets 429, so guesses cannot be told apart.
 */
export async function publicOpenFile(
  token: string, body: unknown, ip: string, deps: PublicAccessDeps,
): Promise<AccessResult<{ url: string }>> {
  const link = await resolveLink(token, ip, deps);
  if (!link.ok) return fail(link.code);
  const { t, recipientId, tokenHash } = link;

  const b = (body ?? {}) as { fileIndex?: unknown; disposition?: unknown; password?: unknown };
  const file = Number.isInteger(b.fileIndex) ? t.files.find(f => f.index === b.fileIndex) : undefined;
  if (!file || (b.disposition !== 'inline' && b.disposition !== 'attachment')) return fail('badRequest');
  if (b.password !== undefined && (typeof b.password !== 'string' || b.password.length > MAX_PASSWORD)) return fail('badRequest');

  if (t.passwordHash) {
    if (await deps.peekLimit('transferPw', tokenHash, PASSWORD_TOKEN_LIMIT)
      || await deps.peekLimit('transferPwIp', ip, PASSWORD_IP_LIMIT)) return fail('rateLimited');
    const password = (b.password as string | undefined) ?? '';
    if (!password || !(await deps.checkPassword(password, t.passwordHash))) {
      // count the failure in both buckets (no short-circuit: both must advance)
      const [byToken, byIp] = await Promise.all([
        deps.hitLimit('transferPw', tokenHash, PASSWORD_TOKEN_LIMIT),
        deps.hitLimit('transferPwIp', ip, PASSWORD_IP_LIMIT),
      ]);
      return fail(byToken && byIp ? 'wrongPassword' : 'rateLimited');
    }
  }

  const disposition = effectiveDisposition(file.contentType, b.disposition);
  const url = await deps.issueFileUrl(t, file.index, disposition);
  await deps.logEvent(accessEvent(t, eventTypeFor(disposition), recipientId, '', file.index, deps.now()));
  return { status: 200, body: { url } };
}

// ── logged-in member access ──────────────────────────────────────────────────────────────────

export interface MemberCaller { personKey: string; isAdmin: boolean; tenantId: string }
export type MemberAccess = { ok: true; recipientId: string } | { ok: false; failure: 'notFound' | 'expired' };

/**
 * Members skip the password: the sender, a tenant admin, or a PERSON recipient
 * (`recipientPersonKeys`). An email-only recipient has no person key there, so a member can never
 * reach a link-only recipient's transfer without the link. A foreign tenant is 'notFound' (no
 * disclosure that the key exists), as is a transfer that was never sent.
 */
export function memberFileAccess(t: FileTransferModel, caller: MemberCaller, nowIso: string): MemberAccess {
  if (!caller.tenantId || !t.tenants.includes(caller.tenantId) || t.state === 'uploading') return { ok: false, failure: 'notFound' };
  const isRecipient = !!caller.personKey && t.recipientPersonKeys.includes(caller.personKey);
  const isSender = !!caller.personKey && t.senderKey === caller.personKey;
  if (!isRecipient && !isSender && !caller.isAdmin) return { ok: false, failure: 'notFound' };
  if (!isFileTransferAccessible(t, nowIso)) return { ok: false, failure: 'expired' };
  return { ok: true, recipientId: isRecipient ? `p:${caller.personKey}` : '' };
}

/** The event a member's open/download writes: actorKey = their personKey. */
export function memberEvent(
  t: FileTransferModel, disposition: FileDisposition, recipientId: string, actorKey: string, fileIndex: number, at: string,
): Omit<FileTransferEventModel, 'okey'> {
  return accessEvent(t, eventTypeFor(disposition), recipientId, actorKey, fileIndex, at);
}
