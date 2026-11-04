import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { AppConfigCollection, FeatureRolloutCollection } from '@okr/shared-models';
import { effectiveFeatures, FEATURE_BLOCKS, type FeatureRollout } from '@okr/tenant-util';

/**
 * A club app whose recordings expire: it has the Logbuch (`trip`) and neither a diary nor a travel journal. A diary
 * or journal app keeps its own recordings for good. Pure.
 */
export function isExpiringTenant(features: Set<string>): boolean {
  return features.has('trip') && !features.has('diary') && !features.has('journal');
}

/** The tenants whose recordings expire. A tenant whose app-config cannot be read is not among them. */
export async function expiringTenants(db: Firestore = getFirestore()): Promise<Set<string>> {
  const [configSnap, rolloutSnap] = await Promise.all([db.collection(AppConfigCollection).get(), db.collection(FeatureRolloutCollection).get()]);
  const rollouts = rolloutSnap.docs.map((d) => ({ okey: d.id, ...d.data() }) as FeatureRollout);
  return new Set(configSnap.docs
    .filter((d) => isExpiringTenant(effectiveFeatures({
      catalogue: FEATURE_BLOCKS, rollouts, tenantId: d.id, enabled: d.get('enabledFeatures') as string[] | undefined,
    })))
    .map((d) => d.id));
}
