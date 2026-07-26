import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { getProjectedAddresses } from '@okr/shared-util-functions';

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

    // Org contact via the shared projection module (spec 1.19 Phase 4, D8): the
    // 'public' viewer tier of the org's addresses — the audited chokepoint for
    // anonymous serving. org.fav* fields were stripped in Phase 4 (no fallback).
    let favEmail = '';
    let favPhone = '';
    if (orgDoc) {
      const addresses = await getProjectedAddresses(db, `org.${orgDoc.id}`, 'public', tenantId);
      favEmail = addresses.find((a) => a.addressChannel === 'email' && a.isFavorite)?.email
        ?? addresses.find((a) => a.addressChannel === 'email')?.email ?? '';
      favPhone = addresses.find((a) => a.addressChannel === 'phone' && a.isFavorite)?.phone
        ?? addresses.find((a) => a.addressChannel === 'phone')?.phone ?? '';
    }

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
