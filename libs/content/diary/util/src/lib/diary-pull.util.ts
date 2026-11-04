import { DiaryConsent, DiarySource, DiarySourceModel, DiaryTarget } from '@okr/shared-models';

export type DiaryConsentState = 'none' | 'waiting' | 'confirmed' | 'partial';

/**
 * One diary's view of one source app as a `DiaryTarget`, so `resolveDiaryTargets` stays the only date rule (spec 1.77
 * §12.5). Its sources are what the diary pulls and the source app allowed (`consents` of the source user); the diary
 * app collecting from itself needs no consent (D-R3). Undefined = this diary has no pull for that app. Pure.
 */
export function pullToTarget(
  doc: DiarySourceModel | undefined,
  diaryTenant: string,
  sourceTenant: string,
  consents: DiaryConsent[] | undefined,
): DiaryTarget | undefined {
  const pull = (doc?.pulls ?? []).find((p) => p.tenantId === sourceTenant);
  if (!pull) return undefined;
  const pulled = pull.sources ?? [];
  const allowed = (consents ?? []).find((c) => c.tenantId === diaryTenant)?.sources ?? [];
  return {
    tenantId: diaryTenant,
    sources: diaryTenant === sourceTenant ? pulled : pulled.filter((s) => allowed.includes(s)),
    from: doc?.from ?? '',
    to: doc?.to ?? '',
  };
}

/** The state a diary shows for one source app (spec 1.77 §12.4). Pure. */
export function consentState(requested: DiarySource[], consented: DiarySource[]): DiaryConsentState {
  if (requested.length === 0) return 'none';
  const covered = requested.filter((s) => consented.includes(s)).length;
  if (covered === 0) return 'waiting';
  return covered === requested.length ? 'confirmed' : 'partial';
}

/** Did this consent change newly allow `source` for that diary? Decides the one sweep of spec 1.77 §12.9. Pure. */
export function gainedSource(
  before: DiaryConsent[] | undefined,
  after: DiaryConsent[],
  diaryTenant: string,
  source: DiarySource,
): boolean {
  const has = (list: DiaryConsent[] | undefined) =>
    (list ?? []).some((c) => c.tenantId === diaryTenant && (c.sources ?? []).includes(source));
  return !has(before) && has(after);
}
