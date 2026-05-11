import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders, parseTags, storeDateToIso, titleToI18n } from '../utils';
import type { I18nString } from '@bk2/shared-models';

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
    images?: Array<{ url: string; alt?: string; width?: number; height?: number }>;
    titleI18n?: I18nString;
    subTitleI18n?: I18nString;
    excerptI18n?: I18nString;
    contentI18n?: I18nString;
    datePublished?: string;
  };
}

function sectionToNewsSummary(doc: ArticleSectionDoc) {
  const props = doc.properties ?? {};
  const img = props.images?.[0];
  return {
    slug: doc.name,
    date: storeDateToIso(props.datePublished ?? ''),
    title: titleToI18n(doc.title, props.titleI18n),
    subTitle: titleToI18n(doc.subTitle, props.subTitleI18n),
    excerpt: props.excerptI18n ?? { de: '' },
    coverImage: img ? {
      url: img.url,
      alt: img.alt ? { de: img.alt } : { de: '' },
      width: img.width ?? 0,
      height: img.height ?? 0,
    } : undefined,
    tags: parseTags(doc.tags),
  };
}

function sectionToNewsDetail(doc: ArticleSectionDoc) {
  const props = doc.properties ?? {};
  return {
    ...sectionToNewsSummary(doc),
    content: props.contentI18n ?? { de: doc.content?.htmlContent ?? '' },
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
      setCacheHeaders(res);
      res.json(sectionToNewsDetail(doc));
      return;
    }

    const limitParam = parseInt(req.query['limit'] as string ?? '50', 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 200);
    const tag = (req.query['tag'] as string)?.trim();

    const snap = await db.collection('sections')
      .where('type', '==', 'article')
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .get();

    let docs = snap.docs.map(d => ({ bkey: d.id, ...d.data() } as ArticleSectionDoc));

    if (tag) {
      docs = docs.filter(d => parseTags(d.tags).includes(tag));
    }

    docs.sort((a, b) => {
      const dateA = a.properties?.datePublished ?? '';
      const dateB = b.properties?.datePublished ?? '';
      return dateB.localeCompare(dateA);
    });

    setCacheHeaders(res);
    res.json(docs.slice(0, limit).map(sectionToNewsSummary));
  } catch (err) {
    logger.error('publicApi /news error', { tenantId, slug, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch news' } });
  }
}
