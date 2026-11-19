import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { AppConfigCollection, OrgCollection } from '@okr/shared-models';
import { zurichStoreDate } from '@okr/shared-util-core';
import { getProjectedAddresses, pickFavoriteByChannel } from '@okr/shared-util-functions';

import { setCacheHeaders } from '../utils';

export async function orgRouter(req: Request, res: Response): Promise<void> {
  const tenantId = (req.query['tenantId'] as string)?.trim();
  if (!tenantId) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Missing tenantId' } });
    return;
  }

  try {
    const db = getFirestore();

    // The tenant's OWN org is app-config.ownerOrgId — not "the first org in the
    // tenant": orgs holds every partner club too, and an arbitrary limit(1) hit
    // one of those. Fall back to the tenant query only if ownerOrgId is unset.
    const configSnap = await db.collection(AppConfigCollection).doc(tenantId).get();
    const ownerOrgId = (configSnap.data()?.['ownerOrgId'] as string | undefined)?.trim();

    let orgDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (ownerOrgId) {
      const ownerSnap = await db.collection(OrgCollection).doc(ownerOrgId).get();
      if (ownerSnap.exists && !ownerSnap.data()?.['isArchived']) orgDoc = ownerSnap;
    }
    if (!orgDoc) {
      const orgSnap = await db.collection(OrgCollection)
        .where('tenants', 'array-contains', tenantId)
        .where('isArchived', '==', false)
        .limit(1)
        .get();
      orgDoc = orgSnap.empty ? null : orgSnap.docs[0];
    }
    const org = orgDoc?.data() ?? null;

    // Org contact + postal address via the shared projection module (spec 1.19
    // Phase 4, D8): the 'public' viewer tier of the org's addresses — the audited
    // chokepoint for anonymous serving. org.fav* fields were stripped in Phase 4
    // (no fallback); favZipCode is the one that still lives on OrgModel.
    let favEmail = '';
    let favPhone = '';
    let street = '';
    let postalCode = '';
    let city = '';
    let countryCode = '';
    if (orgDoc) {
      const addresses = await getProjectedAddresses(db, `org.${orgDoc.id}`, 'public', tenantId);
      favEmail = pickFavoriteByChannel(addresses, 'email')?.email ?? '';
      favPhone = pickFavoriteByChannel(addresses, 'phone')?.phone ?? '';
      const postal = pickFavoriteByChannel(addresses, 'postal', zurichStoreDate());
      street = [postal?.streetName ?? '', postal?.streetNumber ?? ''].filter((p) => p.length > 0).join(' ');
      postalCode = postal?.zipCode ?? '';
      city = postal?.city ?? '';
      countryCode = postal?.countryCode ?? '';
    }

    // tagline, description, social.instagram and logoUrl came from `org.*` keys in the retired
    // `websiteContent` collection (none were ever written). The fields stay in the response,
    // empty, so the public contract does not change (spec 1.153 plan part 3, Task 11).
    setCacheHeaders(res);
    res.json({
      name: org?.['name'] ?? '',
      shortName: org?.['shortName'] ?? '',
      tagline: { de: '', en: '' },
      description: { de: '', en: '' },
      memberCount: org?.['memberCount'] ?? 0,
      address: {
        street,
        postalCode: postalCode || (org?.['favZipCode'] ?? ''),
        city,
        country: countryCode || 'CH',
      },
      contact: {
        email: favEmail,
        phone: favPhone,
      },
      social: {
        instagram: '',
      },
      memberLoginUrl: 'https://app.seeclub.org/',
      logoUrl: '',
    });
  } catch (err) {
    logger.error('publicApi /org error', { tenantId, err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to fetch org' } });
  }
}
