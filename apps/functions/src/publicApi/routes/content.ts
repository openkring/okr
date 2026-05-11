import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders } from '../utils';

interface WebsiteContentDoc {
  key: string;
  de: string;
  en: string;
  tenants: string[];
  isArchived: boolean;
}

export async function contentRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  try {
    const db = getFirestore();
    const snap = await db.collection('websiteContent')
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .get();

    const result: { de: Record<string, string>; en: Record<string, string> } = { de: {}, en: {} };
    for (const doc of snap.docs) {
      const d = doc.data() as WebsiteContentDoc;
      if (d.de) result.de[d.key] = d.de;
      if (d.en) result.en[d.key] = d.en;
    }

    setCacheHeaders(res);
    res.json(result);
  } catch (err) {
    logger.error('publicApi /content error', { tenantId, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch content' } });
  }
}
