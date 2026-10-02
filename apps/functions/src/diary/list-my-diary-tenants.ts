import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { offeredDiarySources } from '@okr/content-diary-util';
import { AppConfigCollection, DiarySource, FeatureRolloutCollection, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { effectiveFeatures, FEATURE_BLOCKS, type FeatureBlock, type FeatureRollout } from '@okr/tenant-util';

import { loginTenantsOf } from '../auth/login-tenants';

export interface DiaryTenantInfo { tenantId: string; title: string; logoUrl: string; travelFrom: string; travelTo: string }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Pure: the diary columns (login tenants with an effective `diary`) and the rows (spec 1.77 §5). */
export function buildDiaryTenantList(input: {
  loginTenants: string[]; callerTenant: string;
  configs: Record<string, Record<string, unknown> | undefined>;
  rollouts: FeatureRollout[]; catalogue: FeatureBlock[];
}): { diaries: DiaryTenantInfo[]; sources: DiarySource[] } {
  const effectiveOf = (tenantId: string): Set<string> => {
    const cfg = input.configs[tenantId];
    if (!cfg) return new Set();
    return effectiveFeatures({
      catalogue: input.catalogue, rollouts: input.rollouts, tenantId,
      enabled: cfg['enabledFeatures'] as string[] | undefined,
    });
  };
  const diaries = input.loginTenants
    .filter(t => effectiveOf(t).has('diary'))
    .map(t => {
      const cfg = input.configs[t] ?? {};
      return { tenantId: t, title: str(cfg['appName']) || t, logoUrl: str(cfg['logoUrl']),
               travelFrom: str(cfg['travelFrom']), travelTo: str(cfg['travelTo']) };
    });
  return { diaries, sources: offeredDiarySources(effectiveOf(input.callerTenant)) };
}

/**
 * Self-scoped (spec 1.77 §5.2): the caller's diary apps and the sources the caller's own app can
 * send. Called only when the profile opens. Read with the Admin SDK because a client can neither
 * list another tenant's users nor rely on reading every rollout doc.
 */
export const listMyDiaryTenants = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request) => {
    const CF_NAME = 'listMyDiaryTenants';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';
    const db = getFirestore();

    const callerTenant = ((await db.collection(UserCollection).doc(uid).get()).get('tenants') as string[] | undefined)?.[0] ?? '';
    const { tenants } = await loginTenantsOf(db, uid);
    const ids = [...new Set([...tenants, callerTenant].filter(Boolean))];
    const [snaps, rolloutSnap] = await Promise.all([
      Promise.all(ids.map(id => db.collection(AppConfigCollection).doc(id).get())),
      db.collection(FeatureRolloutCollection).get(),
    ]);
    const configs = Object.fromEntries(snaps.map((s, i) => [ids[i], s.data()]));
    const rollouts = rolloutSnap.docs.map(d => ({ okey: d.id, ...d.data() }) as FeatureRollout);

    const result = buildDiaryTenantList({ loginTenants: tenants, callerTenant, configs, rollouts, catalogue: FEATURE_BLOCKS });
    logger.info(`${CF_NAME}: uid=${uid} diaries=[${result.diaries.map(d => d.tenantId).join(', ')}] sources=[${result.sources.join(', ')}]`);
    return result;
  },
);
