import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders, parseTags, storeDateToIso, titleToI18n } from '../utils';
import { getHtmlSanitizer, sanitizeI18n } from '../sanitize';
import type { I18nString } from '@bk2/shared-models';

type SanitizeFn = (html: string) => string;
import { shortenText } from '@bk2/shared-util-core';

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
  bkey: string;
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
    slug: doc.name,
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

      if (snap.empty) {
        res.status(404).json({ error: { code: 'not_found', message: 'Article not found', details: { slug } } });
        return;
      }

      const doc = { bkey: snap.docs[0].id, ...snap.docs[0].data() } as ArticleSectionDoc;
      const sanitize = await getHtmlSanitizer();
      setCacheHeaders(res);
      res.json(sectionToNewsDetail(doc, sanitize));
      return;
    }

    const limitParam = parseInt(req.query['limit'] as string ?? '50', 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 200);
    const tag = (req.query['tag'] as string)?.trim();

    // Load the 'news' page by its document ID to get the ordered list of section bkeys
    const pageDoc = await db.collection('pages').doc('news').get();
    if (!pageDoc.exists) {
      res.status(404).json({ error: { code: 'not_found', message: 'News page not found' } });
      return;
    }
    const pageData = pageDoc.data()!;
    if (!pageData['tenants']?.includes(tenantId) || pageData['isArchived'] === true) {
      res.status(404).json({ error: { code: 'not_found', message: 'News page not found' } });
      return;
    }

    const sectionKeys: string[] = pageData['sections'] ?? [];
    if (sectionKeys.length === 0) {
      setCacheHeaders(res);
      res.json([]);
      return;
    }

    const sectionRefs = sectionKeys.map(key => db.collection('sections').doc(key));
    const sectionDocs = await db.getAll(...sectionRefs);

    let docs = sectionDocs
      .filter(d => d.exists)
      .map(d => ({ bkey: d.id, ...d.data() } as ArticleSectionDoc))
      .filter(d => d.type === 'article' && !d.isArchived);

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
