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

/**
 * Request budgets per client IP (bucket `transferGetIp` / `transferPostIp`). The IP is spoofable
 * (X-Forwarded-For), so these only bound casual load — they protect nothing secret.
 */
export const GET_IP_LIMIT = { limit: 120, windowMs: WINDOW_MS };
/** Larger: a recipient plays/downloads many files, each one POST. */
export const POST_IP_LIMIT = { limit: 600, windowMs: WINDOW_MS };
/** Password attempts per personal link (bucket `transferPw`, key = tokenHash). Not IP-based. */
export const PASSWORD_TOKEN_LIMIT = { limit: 5, windowMs: WINDOW_MS, failClosed: true as const };
/**
 * Password attempts per transfer across all its links (bucket `transferPwT`, key = transfer okey):
 * `PASSWORD_TOKEN_LIMIT × max(1, links) + PASSWORD_TOKEN_LIMIT`. One link (capped at
 * PASSWORD_TOKEN_LIMIT on its own) can therefore never exhaust the transfer's budget and lock the
 * other recipients out, while an attacker holding many links stays bounded. Fails CLOSED.
 */
export function passwordTransferLimit(t: Pick<FileTransferModel, 'recipients'>): { limit: number; windowMs: number; failClosed: true } {
  const links = Math.max(1, t.recipients.length);
  return { limit: PASSWORD_TOKEN_LIMIT.limit * links + PASSWORD_TOKEN_LIMIT.limit, windowMs: WINDOW_MS, failClosed: true };
}

/** Personal link tokens are 32 random bytes base64url (43 chars); anything far off is not looked up. */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const MAX_PASSWORD = 200;

/**
 * The only types a file may be served INLINE as. The stored contentType comes from the uploader's
 * client and is unvalidated, so it is matched exactly (no prefixes: no `image/svg+xml`, no
 * `text/html`), and what is sent as `responseType` is this normalised value, never the raw string.
 * Keep in step with FILE_TRANSFER_INLINE_TYPES in libs/content/file-transfer/util (file-transfer-format.ts),
 * which decides whether the client offers a play/view button at all.
 */
export const INLINE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'video/mp4', 'video/quicktime', 'video/webm',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif',
  'application/pdf',
]);
/** What everything not inline-able is served as. */
export const ATTACHMENT_CONTENT_TYPE = 'application/octet-stream';

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * The allow-listed inline type of a stored contentType, or undefined. Strict: a value holding a
 * `,` (a type list a browser or proxy might read differently) or any control character is
 * rejected outright; otherwise lowercased, cut at `;` (parameters dropped) and trimmed.
 */
export function inlineContentType(raw: string): string | undefined {
  if (typeof raw !== 'string' || raw.includes(',') || hasControlChar(raw)) return undefined;
  const type = raw.toLowerCase().split(';')[0].trim();
  return INLINE_CONTENT_TYPES.has(type) ? type : undefined;
}

/** 'inline' only for allow-listed types; everything else is forced to 'attachment'. */
export function effectiveDisposition(contentType: string, requested: FileDisposition): FileDisposition {
  return requested === 'inline' && inlineContentType(contentType) !== undefined ? 'inline' : 'attachment';
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

/**
 * What a GET of a PASSWORD-protected link answers (spec 1.115 §4.2): sender and expiry only, no
 * message and no file names — a forwarded link must not leak them before the password is known.
 * The full view comes from POST …/:token/view with the password.
 */
export function toLockedFileTransferView(t: FileTransferModel): FileTransferView {
  return { transferKey: t.okey, senderName: t.senderName, expiresAt: t.expiresAt, needsPassword: true, message: '', files: [] };
}

/** v4 signed read URL, 10 minutes, with a Content-Disposition naming the original file. */
export async function issueFileUrl(t: FileTransferModel, fileIndex: number, disposition: FileDisposition): Promise<string> {
  const file = t.files.find(f => f.index === fileIndex);
  if (!file) throw new Error(`issueFileUrl: no file ${fileIndex} in ${t.okey}`);
  const effective = effectiveDisposition(file.contentType, disposition);
  const inlineType = effective === 'inline' ? inlineContentType(file.contentType) : undefined;
  const attachment = contentDisposition(file.name, file.path);
  const [url] = await privateBucket().file(file.path).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + URL_TTL_MS,
    responseDisposition: inlineType ? attachment.replace(/^attachment;/, 'inline;') : attachment,
    responseType: inlineType ?? ATTACHMENT_CONTENT_TYPE,
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
  return { ...new FileTransferModel(''), ...data, okey: doc.id } as FileTransferModel;
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

export interface RateLimitOpts { limit: number; windowMs: number; failClosed?: boolean }

/** The I/O of the public handlers, injected so they are testable without Firestore/Storage. */
export interface PublicAccessDeps {
  findByToken(token: string): Promise<FileTransferModel | undefined>;
  /** atomically counts one hit; false (and not counted) when the window is used up; 'unavailable' when a failClosed bucket's datastore failed */
  hitLimit(bucket: string, key: string, opts: RateLimitOpts): Promise<boolean | 'unavailable'>;
  /** gives one hit back within the current window, never below 0 */
  refundLimit(bucket: string, key: string): Promise<void>;
  checkPassword(password: string, stored: string): Promise<boolean>;
  issueFileUrl(t: FileTransferModel, fileIndex: number, disposition: FileDisposition): Promise<string>;
  logEvent(e: Omit<FileTransferEventModel, 'okey'>): Promise<void>;
  now(): string;
}

export type AccessErrorCode = AccessFailure | 'badRequest' | 'unavailable';
export interface AccessResult<T> { status: number; body: T | { error: { code: AccessErrorCode } } }

const STATUS: Record<AccessErrorCode, number> = { notFound: 404, expired: 410, wrongPassword: 401, rateLimited: 429, badRequest: 400, unavailable: 503 };

function fail<T>(code: AccessErrorCode): AccessResult<T> {
  return { status: STATUS[code], body: { error: { code } } };
}

type Resolved = { ok: true; t: FileTransferModel; recipientId: string; tokenHash: string } | { ok: false; code: AccessErrorCode };

/** Per-IP budget, token shape, lookup, recipient and lifetime — shared by GET and POST. */
async function resolveLink(token: string, ip: string, method: 'GET' | 'POST', deps: PublicAccessDeps): Promise<Resolved> {
  const allowed = method === 'GET'
    ? await deps.hitLimit('transferGetIp', ip, GET_IP_LIMIT)
    : await deps.hitLimit('transferPostIp', ip, POST_IP_LIMIT);
  if (allowed !== true) return { ok: false, code: allowed === 'unavailable' ? 'unavailable' : 'rateLimited' };
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { ok: false, code: 'notFound' };
  const t = await deps.findByToken(token);
  const tokenHash = hashToken(token);
  const recipient = t?.recipients.find(r => r.tokenHash === tokenHash);
  if (!t || !recipient || t.state === 'uploading') return { ok: false, code: 'notFound' };
  if (!isFileTransferAccessible(t, deps.now())) return { ok: false, code: 'expired' };
  return { ok: true, t, recipientId: recipient.id, tokenHash };
}

/**
 * Checks a link's password against both password buckets. Every attempt RESERVES a slot in the
 * per-link (`transferPw`, key = tokenHash) and per-transfer (`transferPwT`, key = okey) bucket
 * atomically before the password is checked (so concurrent guesses cannot slip past, and once a
 * bucket is full even the right password gets 429 — a guess cannot be told apart); a RIGHT password
 * refunds both, so a recipient opening many files never locks themself out. An empty password is
 * no guess: 401, not counted. A datastore failure on a password bucket fails CLOSED (503).
 * @returns undefined when the password is right, else the error code
 */
async function checkLinkPassword(
  t: FileTransferModel, tokenHash: string, password: string, deps: PublicAccessDeps,
): Promise<AccessErrorCode | undefined> {
  if (!password) return 'wrongPassword';
  const [byToken, byTransfer] = await Promise.all([
    deps.hitLimit('transferPw', tokenHash, PASSWORD_TOKEN_LIMIT),
    deps.hitLimit('transferPwT', t.okey, passwordTransferLimit(t)),
  ]);
  if (byToken !== true || byTransfer !== true) {
    // the refused attempt was never tried: give back the slot the other bucket did take
    await Promise.all([
      byToken === true ? deps.refundLimit('transferPw', tokenHash) : undefined,
      byTransfer === true ? deps.refundLimit('transferPwT', t.okey) : undefined,
    ]);
    // a failed datastore on a password bucket fails CLOSED: no guess may go untracked
    return byToken === 'unavailable' || byTransfer === 'unavailable' ? 'unavailable' : 'rateLimited';
  }
  if (!(await deps.checkPassword(password, t.passwordHash))) return 'wrongPassword';
  await Promise.all([deps.refundLimit('transferPw', tokenHash), deps.refundLimit('transferPwT', t.okey)]);
  return undefined;
}

/** A password field of an untrusted body: undefined (absent) or a string within MAX_PASSWORD; else invalid. */
function passwordOf(body: unknown): { ok: true; password: string } | { ok: false } {
  const raw = ((body ?? {}) as { password?: unknown }).password;
  if (raw === undefined) return { ok: true, password: '' };
  if (typeof raw !== 'string' || raw.length > MAX_PASSWORD) return { ok: false };
  return { ok: true, password: raw };
}

/**
 * GET /public/api/v1/file-transfer/:token — the full view, or for a password-protected transfer
 * only the locked view (sender, expiry, needsPassword; see toLockedFileTransferView).
 */
export async function publicView(token: string, ip: string, deps: PublicAccessDeps): Promise<AccessResult<FileTransferView>> {
  const link = await resolveLink(token, ip, 'GET', deps);
  if (!link.ok) return fail(link.code);
  const body = link.t.passwordHash ? toLockedFileTransferView(link.t) : toFileTransferView(link.t, false);
  return { status: 200, body };
}

/**
 * POST /public/api/v1/file-transfer/:token/view {password} — the full view of a password-protected
 * transfer once the password is right (same buckets as the file POST, see checkLinkPassword); a
 * transfer without a password answers its full view. Writes NO event: an open is logged per file
 * (`opened` / `downloaded`), seeing the list is not one.
 */
export async function publicViewWithPassword(
  token: string, body: unknown, ip: string, deps: PublicAccessDeps,
): Promise<AccessResult<FileTransferView>> {
  const link = await resolveLink(token, ip, 'POST', deps);
  if (!link.ok) return fail(link.code);
  const pw = passwordOf(body);
  if (!pw.ok) return fail('badRequest');
  if (link.t.passwordHash) {
    const denied = await checkLinkPassword(link.t, link.tokenHash, pw.password, deps);
    if (denied) return fail(denied);
  }
  return { status: 200, body: toFileTransferView(link.t, !!link.t.passwordHash) };
}

/**
 * POST /public/api/v1/file-transfer/:token/file {fileIndex, disposition, password?}
 *
 * Password attempts are limited per link (5 / 15 min, bucket `transferPw`, key = tokenHash) and
 * per transfer (see passwordTransferLimit, 15 min, bucket `transferPwT`, key = okey) — never by the
 * spoofable client IP; see checkLinkPassword. A request without a password is no guess: 401, not counted.
 */
export async function publicOpenFile(
  token: string, body: unknown, ip: string, deps: PublicAccessDeps,
): Promise<AccessResult<{ url: string }>> {
  const link = await resolveLink(token, ip, 'POST', deps);
  if (!link.ok) return fail(link.code);
  const { t, recipientId, tokenHash } = link;

  const b = (body ?? {}) as { fileIndex?: unknown; disposition?: unknown };
  const file = Number.isInteger(b.fileIndex) ? t.files.find(f => f.index === b.fileIndex) : undefined;
  if (!file || (b.disposition !== 'inline' && b.disposition !== 'attachment')) return fail('badRequest');
  const pw = passwordOf(body);
  if (!pw.ok) return fail('badRequest');

  if (t.passwordHash) {
    const denied = await checkLinkPassword(t, tokenHash, pw.password, deps);
    if (denied) return fail(denied);
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
