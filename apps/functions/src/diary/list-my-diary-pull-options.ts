import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { offeredDiarySources } from '@okr/content-diary-util';
import { DiarySource, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { FEATURE_BLOCKS, type FeatureBlock, type FeatureRollout } from '@okr/tenant-util';

import { loginTenantsOf } from '../auth/login-tenants';
import { effectiveOf, PullUser, readPullUsers, readTenantFacts } from './diary-pull';

export interface DiaryPullColumn {
  tenantId: string;
  title: string;
  logoUrl: string;
  /** the rows that app offers */
  sources: DiarySource[];
  /** the rows the person allowed there */
  consented: DiarySource[];
  /** the diary app itself: no confirmation needed (D-R3) */
  own: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The columns of «Tagebuch-Quellen» (spec 1.77 §12.4): the diary app first, then the person's other apps with something
 * to offer. Empty in an app without a diary. The diary app offers no `tracker`: its recordings are there already. Pure.
 */
export function buildDiaryPullOptions(input: {
  ownTenant: string;
  users: PullUser[];
  loginTenants: string[];
  configs: Record<string, Record<string, unknown> | undefined>;
  rollouts: FeatureRollout[];
  catalogue?: FeatureBlock[];
}): DiaryPullColumn[] {
  const { ownTenant, users, loginTenants, configs, rollouts, catalogue } = input;
  if (!effectiveOf(configs, rollouts, ownTenant, catalogue).has('diary')) return [];
  const tenants = [ownTenant, ...loginTenants.filter((t) => t !== ownTenant)];
  return tenants.flatMap((tenantId) => {
    const own = tenantId === ownTenant;
    const offered = offeredDiarySources(effectiveOf(configs, rollouts, tenantId, catalogue));
    const sources = own ? offered.filter((s) => s !== 'tracker') : offered;
    if (sources.length === 0) return [];
    const user = users.find((u) => u.isArchived !== true && (u.tenants ?? []).includes(tenantId));
    const consented = (user?.diaryConsents ?? []).find((c) => c.tenantId === ownTenant)?.sources ?? [];
    const cfg = configs[tenantId] ?? {};
    return [{ tenantId, title: str(cfg['appName']) || tenantId, logoUrl: str(cfg['logoUrl']), sources, consented, own }];
  });
}

/** Self-scoped (spec 1.77 §12.4): a client can read neither another tenant's user doc nor every rollout doc. */
export const listMyDiaryPullOptions = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request) => {
    const CF_NAME = 'listMyDiaryPullOptions';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';
    const db = getFirestore();

    const ownTenant = ((await db.collection(UserCollection).doc(uid).get()).get('tenants') as string[] | undefined)?.[0] ?? '';
    const { personKey, tenants } = await loginTenantsOf(db, uid);
    if (!personKey || !ownTenant) return { columns: [] };

    const { configs, rollouts } = await readTenantFacts(db, [...new Set([...tenants, ownTenant])]);
    const users = await readPullUsers(db, personKey);
    const columns = buildDiaryPullOptions({ ownTenant, users, loginTenants: tenants, configs, rollouts, catalogue: FEATURE_BLOCKS });
    logger.info(`${CF_NAME}: uid=${uid} tenant=${ownTenant} columns=[${columns.map((c) => c.tenantId).join(', ')}]`);
    return { columns };
  },
);
