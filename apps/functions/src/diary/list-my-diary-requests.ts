import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { DiaryConsent, DiarySource, DiarySourceModel, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { effectiveOf, liveUsers, PullUser, readDiarySourceDocs, readPullUsers, readTenantFacts } from './diary-pull';

export interface DiaryRequest {
  tenantId: string;
  title: string;
  logoUrl: string;
  from: string;
  to: string;
  requested: DiarySource[];
  consented: DiarySource[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * What the caller's diaries want from this app (spec 1.77 §12.4). A consent the diary no longer asks for stays listed,
 * so the person can revoke it. The diary app itself needs no confirmation (D-R3). A tenant with two users of the person
 * offers no confirmation: nobody could tell whose request it answers. Pure.
 */
export function buildDiaryRequests(input: {
  ownTenant: string;
  users: PullUser[];
  docs: Record<string, DiarySourceModel | undefined>;
  consents: DiaryConsent[];
  diaryTenants: Set<string>;
  configs: Record<string, Record<string, unknown> | undefined>;
}): DiaryRequest[] {
  const out: DiaryRequest[] = [];
  for (const user of input.users) {
    const tenantId = user.tenants?.[0] ?? '';
    const doc = input.docs[user.id];
    if (user.isArchived === true || !doc || tenantId === input.ownTenant || !input.diaryTenants.has(tenantId)) continue;
    if (input.users.filter((u) => u.isArchived !== true && (u.tenants ?? []).includes(tenantId)).length > 1) continue;
    const requested = (doc.pulls ?? []).find((p) => p.tenantId === input.ownTenant)?.sources ?? [];
    const consented = input.consents.find((c) => c.tenantId === tenantId)?.sources ?? [];
    if (requested.length === 0 && consented.length === 0) continue;
    const cfg = input.configs[tenantId] ?? {};
    out.push({ tenantId, title: str(cfg['appName']) || tenantId, logoUrl: str(cfg['logoUrl']), from: doc.from ?? '', to: doc.to ?? '', requested, consented });
  }
  return out;
}

/** Self-scoped (spec 1.77 §12.4): the diaries asking this app. Called when the profile opens, never at boot. */
export const listMyDiaryRequests = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request) => {
    const CF_NAME = 'listMyDiaryRequests';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';
    const db = getFirestore();

    const own = (await db.collection(UserCollection).doc(uid).get()).data() ?? {};
    const ownTenant = (own['tenants'] as string[] | undefined)?.[0] ?? '';
    const personKey = (own['personKey'] as string | undefined) ?? '';
    if (!personKey || !ownTenant) return { requests: [] };

    const users = await liveUsers(await readPullUsers(db, personKey));
    const tenants = [...new Set(users.flatMap((u) => u.tenants ?? []))];
    const docs = await readDiarySourceDocs(db, users);
    const { configs, rollouts } = await readTenantFacts(db, tenants);
    const requests = buildDiaryRequests({
      ownTenant, users, docs, configs,
      consents: (own['diaryConsents'] as DiaryConsent[] | undefined) ?? [],
      diaryTenants: new Set(tenants.filter((t) => effectiveOf(configs, rollouts, t).has('diary'))),
    });
    logger.info(`${CF_NAME}: uid=${uid} tenant=${ownTenant} requests=[${requests.map((r) => r.tenantId).join(', ')}]`);
    return { requests };
  },
);
