import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders } from '../utils';

export async function pageRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  const pageKey = req.params['pageKey'];

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

    const rawKeys: string[] = pageData['sections'] ?? [];
    // Replace @TID@ placeholder with the actual tenantId
    const sectionKeys = rawKeys.map(k => k.replace('@TID@', tenantId));

    if (sectionKeys.length === 0) {
      setCacheHeaders(res);
      res.json({ title: pageData['title'] ?? '', sections: [] });
      return;
    }

    const sectionRefs = sectionKeys.map(k => db.collection('sections').doc(k));
    const sectionDocs = await db.getAll(...sectionRefs);

    const sections = sectionDocs
      .filter(d => d.exists && d.data()?.['isArchived'] !== true)
      .map(d => {
        const s = d.data()!;
        const type: string = s['type'] ?? 'article';

        if (type === 'table') {
          const body: string[] = s['properties']?.['data']?.['body'] ?? [];
          // body is alternating [label, value, label, value, ...]
          const rows: { label: string; value: string }[] = [];
          for (let i = 0; i + 1 < body.length; i += 2) {
            rows.push({ label: body[i], value: body[i + 1] });
          }
          return {
            type: 'table',
            title: s['title'] ?? '',
            subTitle: s['subTitle'] ?? '',
            rows,
          };
        }

        // article / default: use contentI18n or htmlContent
        const contentI18n = s['properties']?.['contentI18n'];
        const htmlContent: string = contentI18n
          ? (contentI18n['de'] ?? contentI18n['en'] ?? '')
          : (s['content']?.['htmlContent'] ?? '');

        return {
          type: 'article',
          title: s['title'] ?? '',
          subTitle: s['subTitle'] ?? '',
          content: htmlContent,
        };
      });

    setCacheHeaders(res);
    res.json({ title: pageData['title'] ?? '', sections });
  } catch (err) {
    logger.error('publicApi /pages error', { tenantId, pageKey, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch page' } });
  }
}
