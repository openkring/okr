import { Request, Response } from 'express';
import corsLib from 'cors';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';

import type { DocumentLink } from '@okr/shared-models';
import { DocumentCollection, FolderCollection } from '@okr/shared-models';
import { IMGIX_BASE, mapSection, normalizeLang, pickText, slugName, str, toImgixUrl, type I18nString, type PublicPerson, type SanitizeFn, type SectionDoc } from '@okr/cms-website-render';
import { learningTabOf, parseTopics, type LearningTab, type PublicLearningItem, type PublicLearningSection } from '@okr/content-learning-util';

import { isPublishedSection, setCacheHeaders } from '../utils';
import { loadSectionPeople } from '../../website/group-people';
import { getHtmlSanitizer } from '../sanitize';
import { IMGIX_PRIVATE_HOST, signImgixUrl } from '../../_storage/imgix-sign';
import { albumFolderKeyOfPath, isSafeDocId, MP4_PARAMS, POSTER_PARAMS, windowExpiry } from '../../video/video-sign.util';

/** Signs learning-room videos (private bucket) on the public page; mounted on `publicApi` in index.ts. */
export const imgixPrivateToken = defineSecret('IMGIX_PRIVATE_TOKEN');

/** Path prefix of the page route (mounted under the public API base). */
export const PAGES_PATH = '/public/api/v1/pages/';

/** A read of the page route (GET or its preflight); these get the open `pageCors` instead of the origin allowlist. */
export function isPublicPageRead(path: string, method: string): boolean {
  return path.startsWith(PAGES_PATH) && (method === 'GET' || method === 'OPTIONS' || method === 'HEAD');
}

/**
 * Route-level CORS for `GET /pages/:pageKey`: ANY origin, no credentials. The anonymous learning
 * room view (/public/<pageKey>) runs in every tenant app, each on its own origin, and only reads
 * published content — an origin allowlist protects nothing there (CORS is no access control; a
 * server-side caller sends no Origin at all) and would break every tenant app not listed. The
 * tenant allowlist middleware in index.ts still validates `?tenantId=` for this route.
 */
export const pageCors = corsLib({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  credentials: false,
  maxAge: 3600,
});

// --------------------------------------- LEARNING ----------------------------------------
// Spec 1.115 part 2 §5.5: a learning room is public only when its PAGE is published
// (`isPrivate === false`, strict). Otherwise the section is a locked shell. Never exposed: the
// folder key, author names, ratings, comments, curators, attachments (attachment docs may live
// outside the room folder and would leak private files).

/** Whether a page doc is published to the public website. Anything but an explicit `false` is private. */
export function isPublishedPage(page: Record<string, unknown> | undefined): boolean {
  return page?.['isPrivate'] === false;
}

/**
 * A room's material is served only from its OWN learning page: the page is published, has type
 * 'learning', and the section key equals the page key (rooms are created that way). Without this,
 * a privileged user could list a room's section on any public page and bypass the contentAdmin-only
 * publication.
 */
export function mayServeRoom(page: Record<string, unknown> | undefined, pageKey: string, sectionKey: string): boolean {
  return isPublishedPage(page) && page?.['type'] === 'learning' && sectionKey === pageKey;
}

export interface LearningRawDoc { key: string; data: Record<string, unknown> }

export interface LearningSectionOptions {
  published: boolean;
  tenantId: string;
  /** Candidate documents (the folder query); tenant, archive and folder are re-checked here. */
  docs: LearningRawDoc[];
  sanitize: SanitizeFn;
  /** Signed private-imgix mp4 + poster URLs for a validated album-video path. */
  signVideo: (path: string) => { url: string; posterUrl: string };
}

function httpsLinks(raw: unknown): DocumentLink[] {
  if (!Array.isArray(raw)) return [];
  const out: DocumentLink[] = [];
  for (const l of raw as { title?: unknown; url?: unknown }[]) {
    const url = str(l?.url).trim();
    try {
      if (new URL(url).protocol !== 'https:') continue;
    } catch {
      continue;
    }
    out.push({ title: str(l?.title), url });
  }
  return out;
}

/** A storage path of this tenant (`tenant/<tid>/…`, no empty, `.` or `..` segment). fullPath is author-editable. */
function isTenantPath(path: string, tenantId: string): boolean {
  return path.startsWith(`tenant/${tenantId}/`) && !path.split('/').some(seg => seg === '' || seg === '.' || seg === '..');
}

const FIREBASE_DOWNLOAD_PREFIX = 'https://firebasestorage.googleapis.com/';

/**
 * Public URL of a default-bucket document, or '' (item skipped). Images go through imgix by their
 * tenant path; other files use their Firebase download URL, else the imgix path. Both fields are
 * author-editable, so nothing outside the tenant's storage or the Firebase download host passes.
 */
function publicFileUrl(data: Record<string, unknown>, isImage: boolean, tenantId: string): string {
  const path = str(data['fullPath']);
  const validPath = isTenantPath(path, tenantId);
  if (isImage) return validPath ? toImgixUrl(path) : '';
  const url = str(data['url']);
  if (url.startsWith(FIREBASE_DOWNLOAD_PREFIX)) return url;
  return validPath ? `${IMGIX_BASE}/${path.split('/').map(encodeURIComponent).join('/')}` : '';
}

const LEARNING_TABS: LearningTab[] = ['files', 'videos', 'images'];

/** The configured start tab, or 'files' for anything unknown. */
export function learningDefaultTab(value: unknown): LearningTab {
  return LEARNING_TABS.includes(value as LearningTab) ? value as LearningTab : 'files';
}

export function buildLearningSection(s: SectionDoc, o: LearningSectionOptions, lang = 'de'): PublicLearningSection & { name: string } {
  const props = (s.properties ?? {}) as Record<string, unknown>;
  const name = slugName(s.name);
  const title = pickText(s.title, props['titleI18n'] as I18nString | undefined, lang);
  const subTitle = pickText(s.subTitle, props['subTitleI18n'] as I18nString | undefined, lang);
  const folder = str(props['folder']);
  const defaultTab = learningDefaultTab(props['defaultTab']);
  if (!o.published || !folder) return { type: 'learning', name, title, subTitle, locked: true, defaultTab, topics: [], items: [] };

  const items: PublicLearningItem[] = [];
  for (const { key, data } of o.docs) {
    if (data['isArchived'] === true) continue;
    if (!((data['tenants'] as unknown[] | undefined) ?? []).includes(o.tenantId)) continue;
    // Only the doc's FIRST folder counts: firestore.rules check `membersMayUpload` on folderKeys[0]
    // alone, so a member could add a published room as a second folder key and inject a doc into
    // its public output. Room uploads always put the room folder first.
    const folderKeys = (data['folderKeys'] as unknown[] | undefined) ?? [];
    if (folderKeys[0] !== folder) continue;
    const tab = learningTabOf(str(data['mimeType']));
    const item: PublicLearningItem = {
      key,
      tab,
      title: str(data['title']),
      tags: parseTopics(str(data['tags'])),
      notes: o.sanitize(str(data['notes'])),
      links: httpsLinks(data['links']),
      url: '',
    };
    if (tab === 'videos') {
      // fullPath is author-editable: only the album-video layout may be signed for the private host.
      const path = str(data['fullPath']);
      // The path must name an album of THIS room folder: never another room's (or a section's) video.
      if (albumFolderKeyOfPath(path, o.tenantId) !== folder) continue;
      // A signing failure (missing secret) drops the video, never the whole page.
      try {
        const signed = o.signVideo(path);
        item.url = signed.url;
        item.posterUrl = signed.posterUrl;
      } catch (err) {
        logger.warn('publicApi learning: could not sign video', { key, err: String(err) });
        continue;
      }
    } else {
      item.url = publicFileUrl(data, tab === 'images', o.tenantId);
      if (!item.url) continue;
    }
    items.push(item);
  }
  items.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return { type: 'learning', name, title, subTitle, locked: false, defaultTab, topics: parseTopics(str(props['topics'])), items };
}

/**
 * Loads the room's documents (single-field `folderKeys` query, no composite index) and maps the section.
 * Gate: the page must be published AND the room folder must be a live folder of the tenant (as
 * `videoAccessPath` requires) AND the folder must not admit member uploads (`membersMayUpload`):
 * a member's upload would otherwise reach the public site without any curator having seen it.
 * Otherwise the locked shell, and no docs query runs.
 */
export async function loadLearningSection(
  db: Firestore, s: SectionDoc, pagePublished: boolean, tenantId: string, sanitize: SanitizeFn, lang = 'de',
): Promise<PublicLearningSection & { name: string }> {
  const folder = str((s.properties ?? {})['folder']);
  let published = pagePublished && isSafeDocId(folder);
  let docs: LearningRawDoc[] = [];
  if (published) {
    const folderDoc = await db.collection(FolderCollection).doc(folder).get();
    const f = folderDoc.data();
    published = folderDoc.exists && !!f && f['isArchived'] !== true
      && ((f['tenants'] as unknown[] | undefined) ?? []).includes(tenantId)
      && f['membersMayUpload'] !== true;
  }
  if (published) {
    const snap = await db.collection(DocumentCollection).where('folderKeys', 'array-contains', folder).get();
    docs = snap.docs.map(d => ({ key: d.id, data: d.data() }));
  }
  const expires = Math.floor(windowExpiry(Date.now()) / 1000);
  let token: string | undefined;
  const signVideo = (path: string) => {
    token ??= imgixPrivateToken.value();
    return {
      url: signImgixUrl(IMGIX_PRIVATE_HOST, token, path, { ...MP4_PARAMS, expires }),
      posterUrl: signImgixUrl(IMGIX_PRIVATE_HOST, token, path, { ...POSTER_PARAMS, expires }),
    };
  };
  return buildLearningSection(s, { published, tenantId, docs, sanitize, signVideo }, lang);
}

/**
 * The one gate for a section read by key, top-level or nested: such a read never passes a query's
 * filters. The `tenants` check is not redundant with the page's: a page shared across tenants can
 * list section keys that resolve to another tenant's documents.
 */
function isServableSection(section: SectionDoc | undefined, tenantId: string): boolean {
  return !!section && section.isArchived !== true
    && (section.tenants ?? []).includes(tenantId)
    && isPublishedSection(section);
}

/**
 * The public persons shown by the page's people sections from a group or roles (spec 1.153 §13, §13.1), as
 * publishWebsite resolves them. A failed read empties those sections, never the page.
 */
async function loadPagePeople(db: Firestore, sections: SectionDoc[], tenantId: string, pageKey: string): Promise<Map<string, PublicPerson[]>> {
  if (!sections.some((s) => s.type === 'people')) return new Map();
  try {
    return await loadSectionPeople(db, sections, [tenantId]);
  } catch (err) {
    logger.error('publicApi /pages: people of people sections not loaded', { tenantId, pageKey, err: String(err) });
    return new Map();
  }
}

export async function pageRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  const pageKey = req.params['pageKey'] as string;
  const lang = normalizeLang(req.query['lang']);

  try {
    const db = getFirestore();

    const pageDoc = await db.collection('pages').doc(pageKey).get();
    if (!pageDoc.exists) {
      res.status(404).json({ error: { code: 'not_found', message: 'Page not found' } });
      return;
    }

    const pageData = pageDoc.data()!;
    if (!pageData['tenants']?.includes(tenantId) || pageData['isArchived'] === true) {
      res.status(404).json({ error: { code: 'not_found', message: 'Page not found' } });
      return;
    }

    const banner = pageData['bannerUrl']
      ? { url: toImgixUrl(pageData['bannerUrl']), alt: pageData['bannerAltText'] ?? '' }
      : undefined;
    const pageEnvelope = {
      title: pageData['title'] ?? '',
      subTitle: pageData['subTitle'] ?? '',
      abstract: pageData['abstract'] ?? '',
      banner,
    };

    const rawKeys: string[] = pageData['sections'] ?? [];
    const sectionKeys = rawKeys.map(k => k.replace('@TID@', tenantId));

    if (sectionKeys.length === 0) {
      setCacheHeaders(res);
      res.json({ ...pageEnvelope, sections: [] });
      return;
    }

    const sectionRefs = sectionKeys.map(k => db.collection('sections').doc(k));
    const sectionDocs = await db.getAll(...sectionRefs);
    const liveSections = sectionDocs
      .filter(d => isServableSection(d.data() as SectionDoc | undefined, tenantId))
      .map(d => ({ id: d.id, doc: d.data() as SectionDoc }));

    const nestedKeys = new Set<string>();
    for (const { doc: s } of liveSections) {
      if (s.type === 'accordion') {
        const items = ((s.properties?.['items'] as { key?: string }[] | undefined) ?? []);
        for (const it of items) {
          if (it.key) nestedKeys.add(it.key.replace('@TID@', tenantId));
        }
      }
    }

    const nestedSections = new Map<string, SectionDoc>();
    if (nestedKeys.size > 0) {
      const nestedRefs = Array.from(nestedKeys).map(k => db.collection('sections').doc(k));
      const nestedDocs = await db.getAll(...nestedRefs);
      for (const d of nestedDocs) {
        if (isServableSection(d.data() as SectionDoc | undefined, tenantId)) {
          nestedSections.set(d.id, d.data() as SectionDoc);
        }
      }
    }

    const people = await loadPagePeople(db, liveSections.map(({ doc }) => doc), tenantId, pageKey);

    const sanitize = await getHtmlSanitizer();
    const sections = await Promise.all(liveSections.map(({ id, doc: s }) => (s.type === 'learning'
      ? loadLearningSection(db, s, mayServeRoom(pageData, pageKey, id), tenantId, sanitize, lang)
      : mapSection(id, s, nestedSections, sanitize, lang, people))));

    setCacheHeaders(res);
    res.json({ ...pageEnvelope, sections });
  } catch (err) {
    logger.error('publicApi /pages error', { tenantId, pageKey, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch page' } });
  }
}
