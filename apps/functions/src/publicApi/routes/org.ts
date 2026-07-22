import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { setCacheHeaders } from '../utils';

export async function orgRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  try {
    const db = getFirestore();

    const orgSnap = await db.collection('orgs')
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .limit(1)
      .get();

    const orgDoc = orgSnap.empty ? null : orgSnap.docs[0];
    const org = orgDoc?.data() ?? null;

    // Org contact from the favorite email/phone addresses (spec 1.19 Phase 3),
    // falling back to the denormalized org.fav* fields (removed in Phase 4).
    let favEmail = '';
    let favPhone = '';
    if (orgDoc) {
      const addrSnap = await db.collection('addresses')
        .where('parentKey', '==', `org.${orgDoc.id}`)
        .where('isFavorite', '==', true)
        .get();
      for (const a of addrSnap.docs) {
        const d = a.data();
        if (d['addressChannel'] === 'email' && !favEmail) favEmail = String(d['email'] ?? '');
        if (d['addressChannel'] === 'phone' && !favPhone) favPhone = String(d['phone'] ?? '');
      }
    }
    favEmail = favEmail || String(org?.['favEmail'] ?? '');
    favPhone = favPhone || String(org?.['favPhone'] ?? '');

    const contentSnap = await db.collection('websiteContent')
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .get();

    const content: Record<string, { de: string; en: string }> = {};
    for (const doc of contentSnap.docs) {
      const d = doc.data();
      if ((d['key'] as string).startsWith('org.')) {
        content[d['key'] as string] = { de: d['de'] ?? '', en: d['en'] ?? '' };
      }
    }

    setCacheHeaders(res);
    res.json({
      name: org?.['name'] ?? content['org.name']?.de ?? '',
      shortName: org?.['shortName'] ?? content['org.shortName']?.de ?? '',
      tagline: content['org.tagline'] ?? { de: '', en: '' },
      description: content['org.description'] ?? { de: '', en: '' },
      memberCount: org?.['memberCount'] ?? 0,
      address: {
        street: org?.['favStreet'] ?? '',
        postalCode: org?.['favZipCode'] ?? '',
        city: org?.['favCity'] ?? '',
        country: 'CH',
      },
      contact: {
        email: favEmail,
        phone: favPhone,
      },
      social: {
        instagram: content['org.instagram']?.de ?? '',
      },
      memberLoginUrl: 'https://seeclub.org/',
      logoUrl: content['org.logoUrl']?.de ?? '',
    });
  } catch (err) {
    logger.error('publicApi /org error', { tenantId, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch org' } });
  }
}
