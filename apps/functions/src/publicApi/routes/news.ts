import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders, parseTags, storeDateToIso, titleToI18n } from '../utils';
import { getHtmlSanitizer, sanitizeI18n } from '../sanitize';
import type { I18nString } from '@okr/shared-models';

type SanitizeFn = (html: string) => string;
import { shortenText } from '@okr/shared-util-core';

const IMGIX_BASE = 'https://bkaiser.imgix.net';

function toImgixUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('https://')) return path;
  return `${IMGIX_BASE}/${path}?auto=compress,format=jpg`;
}

interface StoredImage {
  url: string;
  altText?: string;
}

interface ArticleSectionDoc {
  okey: string;
  name: string;
  title: string;
  subTitle: string;
  tags: string;
  tenants: string[];
  isArchived: boolean;
  type: string;
  content: { htmlContent: string };
  properties?: {
    images?: StoredImage[];
    titleI18n?: I18nString;
    subTitleI18n?: I18nString;
    excerptI18n?: I18nString;
    contentI18n?: I18nString;
    datePublished?: string;
  };
}

function excerptFromContent(contentI18n: I18nString | undefined, htmlContent: string): I18nString {
  if (contentI18n) {
    const result: I18nString = {};
    for (const [lang, html] of Object.entries(contentI18n)) {
      result[lang] = shortenText(html as string, 30, true);
    }
    if (Object.keys(result).length > 0) return result;
  }
  return { de: shortenText(htmlContent, 30, true) };
}

function hasContent(i18n: I18nString | undefined): boolean {
  return !!i18n && Object.values(i18n).some(v => (v as string).trim().length > 0);
}

/**
 * The URL-addressable id of an article.
 *
 * Normally the section's `name` (`20260730news_coupedelajeunesse`), which is what the
 * `/news/:slug` lookup queries. But `name` is not enforced anywhere — 2 of scs's 209 article
 * sections carry an empty one — and an empty slug makes the article unreachable: the detail
 * route cannot match a blank path segment. Fall back to the document id, which always exists
 * and which the detail route resolves as a second lookup.
 */
export function articleSlug(doc: Pick<ArticleSectionDoc, 'name' | 'okey'>): string {
  return (doc.name ?? '').trim() || doc.okey;
}

function mapImage(img: StoredImage) {
  return { url: toImgixUrl(img.url), alt: { de: img.altText ?? '' } };
}

function sectionToNewsSummary(doc: ArticleSectionDoc, sanitize: SanitizeFn) {
  const props = doc.properties ?? {};
  const img = props.images?.[0];
  const excerpt = hasContent(props.excerptI18n)
    ? props.excerptI18n!
    : excerptFromContent(props.contentI18n, doc.content?.htmlContent ?? '');
  return {
    slug: articleSlug(doc),
    date: storeDateToIso(props.datePublished ?? ''),
    title: titleToI18n(doc.title, props.titleI18n),
    subTitle: titleToI18n(doc.subTitle, props.subTitleI18n),
    excerpt: sanitizeI18n(excerpt, sanitize),
    coverImage: img ? mapImage(img) : undefined,
    tags: parseTags(doc.tags),
  };
}

function sectionToNewsDetail(doc: ArticleSectionDoc, sanitize: SanitizeFn) {
  const props = doc.properties ?? {};
  const images = (props.images ?? []).map(mapImage);
  return {
    ...sectionToNewsSummary(doc, sanitize),
    content: sanitizeI18n(props.contentI18n ?? { de: doc.content?.htmlContent ?? '' }, sanitize),
    images,
  };
}

export async function newsRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  const slug = req.params['slug'];

  try {
    const db = getFirestore();

    if (slug) {
      const snap = await db.collection('sections')
        .where('name', '==', slug)
        .where('type', '==', 'article')
        .where('tenants', 'array-contains', tenantId)
        .where('isArchived', '==', false)
        .limit(1)
        .get();

      let doc: ArticleSectionDoc | undefined = snap.empty
        ? undefined
        : { okey: snap.docs[0].id, ...snap.docs[0].data() } as ArticleSectionDoc;

      // Second chance: the slug may be a document id, which is what articleSlug() emits for
      // an article whose `name` is empty. A read by id skips the query's filters, so re-apply
      // every one of them here — especially `tenants`, or this becomes a cross-tenant reader.
      if (!doc) {
        const byId = await db.collection('sections').doc(slug).get();
        const data = byId.exists ? byId.data() ?? {} : undefined;
        if (data
          && data['type'] === 'article'
          && data['isArchived'] !== true
          && ((data['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
          doc = { okey: byId.id, ...data } as ArticleSectionDoc;
        }
      }

      if (!doc) {
        res.status(404).json({ error: { code: 'not_found', message: 'Article not found', details: { slug } } });
        return;
      }

      const sanitize = await getHtmlSanitizer();
      setCacheHeaders(res);
      res.json(sectionToNewsDetail(doc, sanitize));
      return;
    }

    const limitParam = parseInt(req.query['limit'] as string ?? '50', 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 200);
    const tag = (req.query['tag'] as string)?.trim();

    // Load the tenant's blog page by document ID to get the ordered list of section okeys.
    // Page document ids are GLOBAL, so the id has to carry the tenant (`news_scs`,
    // `news_elab`) — a literal 'news' served scs's articles to every tenant.
    const pageDoc = await db.collection('pages').doc(`news_${tenantId}`).get();
    if (!pageDoc.exists) {
      res.status(404).json({ error: { code: 'not_found', message: 'News page not found' } });
      return;
    }
    const pageData = pageDoc.data()!;
    if (!pageData['tenants']?.includes(tenantId) || pageData['isArchived'] === true) {
      res.status(404).json({ error: { code: 'not_found', message: 'News page not found' } });
      return;
    }

    // Section keys may carry the @TID@ placeholder — same contract as the /pages route
    // and the app's PageStore. Without the substitution a shared page hands every tenant
    // the same section documents.
    const sectionKeys: string[] = (pageData['sections'] ?? []).map((k: string) => k.replace('@TID@', tenantId));
    if (sectionKeys.length === 0) {
      setCacheHeaders(res);
      res.json([]);
      return;
    }

    const sectionRefs = sectionKeys.map(key => db.collection('sections').doc(key));
    const sectionDocs = await db.getAll(...sectionRefs);

    let docs = sectionDocs
      .filter(d => d.exists)
      .map(d => ({ okey: d.id, ...d.data() } as ArticleSectionDoc))
      // `tenants` is checked here too: these are reads BY KEY, so the array-contains
      // filter that guards every query does not apply.
      .filter(d => d.type === 'article' && !d.isArchived && (d.tenants ?? []).includes(tenantId));

    if (tag) {
      docs = docs.filter(d => parseTags(d.tags).includes(tag));
    }

    docs.sort((a, b) => {
      const dateA = a.properties?.datePublished ?? '';
      const dateB = b.properties?.datePublished ?? '';
      return dateB.localeCompare(dateA);
    });

    const sanitize = await getHtmlSanitizer();
    setCacheHeaders(res);
    res.json(docs.slice(0, limit).map(d => sectionToNewsSummary(d, sanitize)));
  } catch (err) {
    logger.error('publicApi /news error', { tenantId, slug, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch news' } });
  }
}
