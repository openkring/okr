import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

import { DEFAULT_MIMETYPES } from '@okr/shared-constants';
import {
  DocumentLink, DocumentModel, GroupCollection, GroupModel, LearningConfig, PageCollection, PageModel, SectionCollection, UserCollection, UserModel,
} from '@okr/shared-models';
import { addIndexElement, getDeletePatch, getMimeType, isKioskOnly, MAX_VIDEO_BYTES } from '@okr/shared-util-core';
import { tenantIdOfUserData } from '@okr/shared-util-functions';
import {
  canChangeTags, canDeleteItem, canEditItem, canUploadTo, LEARNING_LINK_TITLE_MAX, LEARNING_LINKS_MAX, LEARNING_NOTES_MAX, LEARNING_TITLE_MAX,
  learningTabOf, parseTopics, type LearningActor, type LearningTab,
} from '@okr/content-learning-util';

import { safeVideoFileName } from '../video/chat-video.util';
import { isAlbumVideoObjectPath, isSafeDocId } from '../video/video-sign.util';

/*
 * Spec 1.115 part 2 — the server-side gate for curator writes in learning rooms. The three
 * callables (saveLearningItem, prepareLearningUpload, deleteLearningItem) stay thin: every
 * decision lives here as a pure function over the Task 2 rules of @okr/content-learning-util.
 */

const LEARNING_PAGE_TYPE = 'learning';
const LEARNING_ROOM_SUFFIX = '_learning';
/** The general Storage cap (`sizeOk()` in storage.rules). A signed URL bypasses the rules, so it is bound here. */
export const LEARNING_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const LEARNING_ATTACHMENTS_MAX = 20;
const TAGS_MAX = 1000;
const FILE_NAME_MAX = 255;
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi'];
/**
 * What a learning upload may be. The extension decides (the same lookup imgix does); the picker's
 * DEFAULT_MIMETYPES minus the Apple UTIs (not content types). SVG and HTML are absent on purpose.
 */
const UPLOAD_MIMETYPES = DEFAULT_MIMETYPES.filter(m => m.includes('/'));

type Data = Record<string, unknown>;

const invalid = (message: string): HttpsError => new HttpsError('invalid-argument', message);
const denied = (message: string): HttpsError => new HttpsError('permission-denied', message);

function key(value: unknown, name: string): string {
  if (!isSafeDocId(value)) throw invalid(`Invalid ${name}.`);
  return value;
}

function asData(data: unknown): Data {
  if (typeof data !== 'object' || data === null) throw invalid('Missing request data.');
  return data as Data;
}

/* ------------------------------------------------------------------ room resolution ---- */

/** `<groupKey>_learning` → `<groupKey>`; anything else → ''. Whether the group exists is checked by loadRoom. */
export function groupKeyCandidate(pageKey: string): string {
  if (typeof pageKey !== 'string' || !pageKey.endsWith(LEARNING_ROOM_SUFFIX)) return '';
  return pageKey.slice(0, -LEARNING_ROOM_SUFFIX.length);
}

/** The page's section keys with `@TID@` replaced, unsafe ids dropped, in page order. */
export function learningSectionKeys(sections: string[] | undefined, tenantId: string): string[] {
  return (sections ?? [])
    .map(s => (typeof s === 'string' ? s.split('@TID@').join(tenantId) : ''))
    .filter(isSafeDocId);
}

/** The config of the first section (in page order) that is a learning section of the tenant with a safe folder key. */
export function pickLearningConfig(sections: (Data | undefined)[], tenantId: string): LearningConfig | undefined {
  for (const s of sections) {
    if (!s || s['type'] !== 'learning' || !(s['tenants'] as string[] | undefined)?.includes(tenantId)) continue;
    const config = s['properties'] as LearningConfig | undefined;
    if (config && isSafeDocId(config.folder)) {
      return { folder: config.folder, topics: config.topics ?? '', curators: config.curators ?? [], defaultTab: config.defaultTab };
    }
  }
  return undefined;
}

/** A live learning page of the tenant, or throws. */
export function assertLearningPage(page: Partial<PageModel> | undefined, tenantId: string): void {
  if (!page || !page.tenants?.includes(tenantId) || page.isArchived === true) throw new HttpsError('not-found', 'Learning room not found.');
  if (page.type !== LEARNING_PAGE_TYPE) throw new HttpsError('failed-precondition', 'Not a learning room.');
}

/** Reads the room: its page, the config of its first learning section and, for a group room, the group key. */
export async function loadRoom(db: Firestore, tenantId: string, pageKey: string): Promise<{ page: PageModel; config: LearningConfig; groupKey: string }> {
  const pageSnap = await db.collection(PageCollection).doc(key(pageKey, 'pageKey')).get();
  const page = pageSnap.data() as PageModel | undefined;
  assertLearningPage(page, tenantId);
  const sectionKeys = learningSectionKeys((page as PageModel).sections, tenantId);
  const snaps = sectionKeys.length ? await db.getAll(...sectionKeys.map(k => db.collection(SectionCollection).doc(k))) : [];
  const config = pickLearningConfig(snaps.map(s => s.data()), tenantId);
  if (!config) throw new HttpsError('failed-precondition', 'Learning room has no learning section.');

  let groupKey = groupKeyCandidate(pageKey);
  if (groupKey) {
    const group = isSafeDocId(groupKey) ? (await db.collection(GroupCollection).doc(groupKey).get()).data() as Partial<GroupModel> | undefined : undefined;
    if (!group || !group.tenants?.includes(tenantId) || group.isArchived === true) groupKey = '';
  }
  return { page: { ...(page as PageModel), okey: pageKey }, config, groupKey };
}

export interface LearningCaller {
  uid: string;
  tenantId: string;
  user: Partial<UserModel>;
}

/**
 * The caller's single `users/{uid}` read: the tenant (same derivation as getCallerTenantId, which
 * would read the doc a second time) and the user data the actor is built from.
 */
export async function loadCaller(db: Firestore, uid: string): Promise<LearningCaller> {
  const user = (await db.collection(UserCollection).doc(uid).get()).data() as Partial<UserModel> | undefined;
  if (!user) throw denied('No user profile.');
  const tenantId = tenantIdOfUserData(user as Record<string, unknown>);
  if (!tenantId) throw new HttpsError('failed-precondition', 'User is not linked to a tenant.');
  return { uid, tenantId, user };
}

/**
 * The caller as the learning rules see them: registered and not kiosk-only.
 *
 * `isGroupAdmin` is ALWAYS false. `group.admins` is not a trustworthy source of rights here:
 * firestore.rules lets any registered member of the tenant update any group doc (`groups` uses
 * `tenantCreateOrDetach()`), including its `admins` array — so a member could make themselves the
 * group admin and become curator of every topic. Group rooms are curated by contentAdmin/admin and
 * the named curators only, until group writes are locked down (fix round 1, Task 3).
 */
export function learningActor(user: Partial<UserModel>): LearningActor & { name: string } {
  if (user.roles?.registered !== true || isKioskOnly(user as UserModel)) throw denied('Registered users only.');
  const personKey = typeof user.personKey === 'string' ? user.personKey : '';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return { personKey, roles: user.roles ?? {}, isGroupAdmin: false, name };
}

/**
 * The search index of a document — the same four elements, in the same order, as
 * `getDocumentIndex` in libs/content/document/util/src/lib/document.util.ts. That lib pulls in
 * Capacitor and Ionic and cannot be bundled into the functions, so it is mirrored here; keep both
 * in step.
 */
export function learningDocumentIndex(doc: Partial<DocumentModel>): string {
  let index = '';
  index = addIndexElement(index, 'n', doc.title ?? '');
  index = addIndexElement(index, 'h', doc.hash ?? '');
  index = addIndexElement(index, 'm', doc.mimeType ?? '');
  index = addIndexElement(index, 'f', (doc.folderKeys ?? []).join(' '));
  return index;
}

/** The doc belongs to the tenant, is live and sits in the room folder — or throws. */
export function assertDocInRoom(doc: Partial<DocumentModel> | undefined, config: LearningConfig, tenantId: string): asserts doc is Partial<DocumentModel> {
  if (!doc || !doc.tenants?.includes(tenantId) || doc.isArchived === true) throw new HttpsError('not-found', 'Document not found.');
  if (!(doc.folderKeys ?? []).includes(config.folder)) throw denied('Document is not in this learning room.');
}

/* ------------------------------------------------------------------ save ---- */

export interface SaveLearningItemRequest {
  pageKey: string;
  docKey: string;
  title?: string;
  tags?: string;
  notes?: string;
  links?: DocumentLink[];
  attachmentKeys?: string[];
}

function isHttpsUrl(url: string): boolean {
  if (/\s/.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

function parseLinks(value: unknown): DocumentLink[] {
  if (!Array.isArray(value) || value.length > LEARNING_LINKS_MAX) throw invalid('Invalid links.');
  return value.map(l => {
    const title = typeof l?.title === 'string' ? l.title.trim() : '';
    const url = typeof l?.url === 'string' ? l.url.trim() : '';
    if (!title || title.length > LEARNING_LINK_TITLE_MAX) throw invalid('Invalid link title.');
    if (!isHttpsUrl(url)) throw invalid('Links must be https.');
    return { title, url };
  });
}

/** Shape check of the untrusted payload; only fields present in it are returned. */
export function parseSaveRequest(data: unknown): SaveLearningItemRequest {
  const d = asData(data);
  const req: SaveLearningItemRequest = { pageKey: key(d['pageKey'], 'pageKey'), docKey: key(d['docKey'], 'docKey') };
  if (d['title'] !== undefined) {
    const title = typeof d['title'] === 'string' ? d['title'].trim() : '';
    if (!title || title.length > LEARNING_TITLE_MAX) throw invalid('Invalid title.');
    req.title = title;
  }
  if (d['tags'] !== undefined) {
    if (typeof d['tags'] !== 'string' || d['tags'].length > TAGS_MAX) throw invalid('Invalid tags.');
    req.tags = d['tags'];
  }
  if (d['notes'] !== undefined) {
    if (typeof d['notes'] !== 'string') throw invalid('Invalid notes.');
    req.notes = d['notes'];
  }
  if (d['links'] !== undefined) req.links = parseLinks(d['links']);
  if (d['attachmentKeys'] !== undefined) {
    const keys = d['attachmentKeys'];
    if (!Array.isArray(keys) || !keys.every(isSafeDocId)) throw invalid('Invalid attachmentKeys.');
    const unique = [...new Set(keys as string[])];
    if (unique.length > LEARNING_ATTACHMENTS_MAX || unique.includes(req.docKey)) throw invalid('Invalid attachmentKeys.');
    req.attachmentKeys = unique;
  }
  return req;
}

/**
 * The Firestore patch a save may write, or throws. Content fields need edit rights on the item as it
 * stands; tags go through canChangeTags (which itself requires edit rights). Notes are sanitised
 * with `sanitize` and capped AFTER sanitising. Attachment existence is checked by the callable.
 */
export function decideSave(
  config: LearningConfig, actor: LearningActor, doc: Partial<DocumentModel>, req: SaveLearningItemRequest,
  sanitize: (html: string) => string, today: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const oldTags = doc.tags ?? '';
  const contentFields = ['title', 'notes', 'links', 'attachmentKeys'] as const;
  const touchesContent = contentFields.some(f => req[f] !== undefined);
  if (!touchesContent && req.tags === undefined) throw invalid('Nothing to save.');
  if (touchesContent && !canEditItem(config, actor, oldTags)) throw denied('Not a curator of this item.');
  if (req.tags !== undefined) {
    const newTags = parseTopics(req.tags).join(',');
    if (!canChangeTags(config, actor, oldTags, newTags)) throw denied('Not allowed to change these topics.');
    patch['tags'] = newTags;
  }
  if (req.title !== undefined) patch['title'] = req.title;
  if (req.notes !== undefined) {
    const notes = sanitize(req.notes);
    if (notes.length > LEARNING_NOTES_MAX) throw invalid('Notes are too long.');
    patch['notes'] = notes;
  }
  if (req.links !== undefined) patch['links'] = req.links;
  if (req.attachmentKeys !== undefined) patch['attachmentKeys'] = req.attachmentKeys;
  patch['index'] = learningDocumentIndex({ ...doc, ...patch });
  patch['dateOfDocLastUpdate'] = today;
  return patch;
}

/* ------------------------------------------------------------------ upload ---- */

export interface PrepareLearningUploadRequest {
  pageKey: string;
  topic: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface LearningUploadDecision {
  tab: LearningTab;
  bucket: 'private' | 'default';
  contentType: string;
  /** the declared size: bound into the signed URL as `x-goog-content-length-range: 0,<maxBytes>` */
  maxBytes: number;
}

export function parseUploadRequest(data: unknown): PrepareLearningUploadRequest {
  const d = asData(data);
  const { topic, fileName, size } = d;
  if (typeof topic !== 'string' || !topic.trim() || topic.length > TAGS_MAX) throw invalid('Invalid topic.');
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > FILE_NAME_MAX) throw invalid('Invalid fileName.');
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) throw invalid('Invalid size.');
  const contentType = typeof d['contentType'] === 'string' ? d['contentType'].trim().toLowerCase().slice(0, 100) : '';
  return { pageKey: key(d['pageKey'], 'pageKey'), topic: topic.trim(), fileName, contentType, size };
}

/** Where an upload goes, with which content type and size bound — or throws. */
export function decideUpload(config: LearningConfig, actor: LearningActor, req: PrepareLearningUploadRequest): LearningUploadDecision {
  if (!parseTopics(config.topics).includes(req.topic)) throw invalid('Not a topic of this room.');
  if (!canUploadTo(config, actor, req.topic)) throw denied('Not a curator of this topic.');
  // The extension decides, never the declared type: the signed URL bypasses the Storage rules, and
  // the stored content type is what the object is served as.
  const contentType = getMimeType(req.fileName).toLowerCase();
  if (!contentType || !UPLOAD_MIMETYPES.includes(contentType)) throw invalid('Unsupported file type.');
  const tab = learningTabOf(contentType);
  if (tab === 'videos') {
    const ext = /\.([A-Za-z0-9]+)$/.exec(req.fileName)?.[1]?.toLowerCase() ?? '';
    if (!VIDEO_EXTENSIONS.includes(ext)) throw invalid('Unsupported video type.');
    if (req.size > MAX_VIDEO_BYTES) throw invalid('Video is too large.');
    return { tab, bucket: 'private', contentType, maxBytes: req.size };
  }
  if (req.size > LEARNING_FILE_MAX_BYTES) throw invalid('File is too large.');
  return { tab, bucket: 'default', contentType, maxBytes: req.size };
}

/**
 * `tenant/<tid>/folder/<folderKey>/album/<random>/<safe name>` — the folder album layout
 * (AlbumSectionStore.addFiles). A video there in the private bucket is what signVideoUrls signs.
 */
export function learningUploadPath(tenantId: string, folderKey: string, fileName: string, random: string): string {
  return `tenant/${tenantId}/folder/${folderKey}/album/${random}/${safeVideoFileName(fileName)}`;
}

/** Refuses a private-bucket video path the album rule (and signVideoUrls) would not admit. */
export function assertUploadPath(path: string, tenantId: string, decision: LearningUploadDecision): void {
  if (decision.bucket === 'private' && !isAlbumVideoObjectPath(path, tenantId)) throw invalid('Unsupported video file name.');
}

/**
 * The headers the client must send with its PUT, exactly as signed: the content type and the size
 * bound. No metadata header: GCS lower-cases `x-goog-meta-*` keys, so a token sent that way lands
 * as `firebasestoragedownloadtokens` and Firebase never serves it. completeLearningUpload sets the
 * download token afterwards with the admin SDK (exact casing).
 */
export function learningUploadHeaders(decision: LearningUploadDecision): Record<string, string> {
  return {
    'Content-Type': decision.contentType,
    'x-goog-content-length-range': `0,${decision.maxBytes}`,
  };
}

/** The Firebase download URL of a default-bucket object with the given token. */
export function firebaseDownloadUrl(bucketName: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/* ------------------------------------------------------------------ complete ---- */

export interface CompleteLearningUploadRequest {
  pageKey: string;
  docKey: string;
}

export function parseCompleteRequest(data: unknown): CompleteLearningUploadRequest {
  const d = asData(data);
  return { pageKey: key(d['pageKey'], 'pageKey'), docKey: key(d['docKey'], 'docKey') };
}

/** Only the uploader (the doc's author) or contentAdmin/admin may complete an upload. */
export function assertMayComplete(actor: LearningActor, doc: Partial<DocumentModel>): void {
  const isAuthor = !!actor.personKey && actor.personKey === doc.authorKey;
  if (!isAuthor && actor.roles.contentAdmin !== true && actor.roles.admin !== true) throw denied('Not the uploader of this item.');
}

/** Which bucket the doc's object was signed into (prepareLearningUpload: videos → private, else default). */
export function learningBucketOf(doc: Partial<DocumentModel>): 'private' | 'default' {
  return learningTabOf(doc.mimeType ?? '') === 'videos' ? 'private' : 'default';
}

/**
 * The PUT must have landed: the object exists and has exactly the declared size (the signed size
 * bound only caps it). Otherwise failed-precondition — the client then removes the doc again.
 */
export function assertUploadLanded(exists: boolean, objectSize: unknown, doc: Partial<DocumentModel>): void {
  if (!exists) throw new HttpsError('failed-precondition', 'Upload not found.');
  if (typeof doc.size !== 'number' || Number(objectSize) !== doc.size) throw new HttpsError('failed-precondition', 'Upload size mismatch.');
}

/** An existing Firebase download token of the object (first of the comma list), or ''. Keeps a repeated completion stable. */
export function existingDownloadToken(metadata: Record<string, unknown> | undefined): string {
  const raw = metadata?.['firebaseStorageDownloadTokens'];
  return typeof raw === 'string' ? (raw.split(',')[0]?.trim() ?? '') : '';
}

/** The custom-metadata patch that gives a default-bucket object its Firebase download token. */
export function downloadTokenMetadata(token: string): { metadata: { firebaseStorageDownloadTokens: string } } {
  return { metadata: { firebaseStorageDownloadTokens: token } };
}

/* ------------------------------------------------------------------ delete ---- */

export interface DeleteLearningItemRequest {
  pageKey: string;
  docKey: string;
}

export function parseDeleteRequest(data: unknown): DeleteLearningItemRequest {
  const d = asData(data);
  return { pageKey: key(d['pageKey'], 'pageKey'), docKey: key(d['docKey'], 'docKey') };
}

/**
 * The patch a delete writes, or throws. A doc in other folders too is only detached from the room
 * folder; otherwise it is archived per the deleting-models rule (getDeletePatch: detach the tenant of
 * a shared doc, archive on the last tenant). Storage is never touched.
 */
export function decideDelete(config: LearningConfig, actor: LearningActor, doc: Partial<DocumentModel>, tenantId: string, today: string): Record<string, unknown> {
  if (!canDeleteItem(config, actor, doc.tags ?? '', doc.authorKey)) throw denied('Not allowed to delete this item.');
  const others = (doc.folderKeys ?? []).filter(k => k !== config.folder);
  if (others.length > 0) return { folderKeys: others, index: learningDocumentIndex({ ...doc, folderKeys: others }), dateOfDocLastUpdate: today };
  const patch = getDeletePatch(doc.tenants, tenantId);
  if (Object.keys(patch).length === 0) throw new HttpsError('failed-precondition', 'System documents cannot be deleted here.');
  return { ...patch, dateOfDocLastUpdate: today };
}
