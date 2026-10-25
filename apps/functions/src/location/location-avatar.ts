import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { AvatarCollection, LocationCollection } from '@okr/shared-models';

import { getLocationAvatarCatalog } from './location-avatar.catalog';
import { ExistingAvatar, LocationLike, locationAvatarDocId, planLocationAvatar } from './location-avatar.util';

/**
 * Keeps the shared avatar `avatars/location.<okey>` in step with the location: the Gemeinde's coat
 * of arms, else the canton's / Bundesland's, else the country's flag (see location-avatar.util).
 * The doc is tenant-less (`tenants: ['system']`), so every tenant shows it; a hand-uploaded picture
 * is never replaced. Existing locations: scripts/backfill-location-avatars.ts.
 */
export const onLocationWritten = onDocumentWritten(
  { document: `${LocationCollection}/{id}`, region: 'europe-west6' },
  async (event) => {
    const before = event.data?.before.data() as LocationLike | undefined;
    const after = event.data?.after.data() as LocationLike | undefined;
    if (before && after && before.name === after.name && before.address === after.address) return;

    const db = getFirestore();
    const ref = db.collection(AvatarCollection).doc(locationAvatarDocId(event.params.id));
    const existing = (await ref.get()).data() as ExistingAvatar | undefined;
    const action = planLocationAvatar(after, existing, await getLocationAvatarCatalog());
    if (action.kind === 'set') {
      await ref.set({ tenants: ['system'], isArchived: false, storagePath: action.storagePath });
    } else if (action.kind === 'delete') {
      await ref.delete();
    }
    logger.info(`onLocationWritten: ${action.kind} avatar of location ${event.params.id}`);
  }
);
