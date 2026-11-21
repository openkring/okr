/** Pure rules of the `saveHousehold` callable (spec 1.168). */
import { DEFAULT_HOUSEHOLD_BUNDLE, HouseholdBundle, HouseholdModel } from '@okr/shared-models';
import { readBundle, removeHouseholdMember, shouldArchiveHousehold } from '@okr/shared-util-core';

/**
 * The doc to store: bundle normalised (missing fields = defaults), payer/contact of a removed member moved to the
 * first remaining one, `okey` stripped (it is the document id), and `archive` = fewer than two members remain.
 */
export function prepareHouseholdWrite(before: HouseholdModel | undefined, after: HouseholdModel): { doc: HouseholdModel; archive: boolean } {
  let doc: HouseholdModel = { ...after, bundle: { ...DEFAULT_HOUSEHOLD_BUNDLE, ...readBundle(after) } };
  for (const removed of (before?.memberKeys ?? []).filter((k) => !doc.memberKeys.includes(k))) {
    doc = removeHouseholdMember(doc, removed);
  }
  const archive = shouldArchiveHousehold(doc);
  const { okey: _okey, ...rest } = doc;
  void _okey;
  return { doc: rest as HouseholdModel, archive };
}

/**
 * Whether the stored doc is archived. A member never writes an archived household (refused: `undefined` result);
 * an admin keeps the stored state unless the request says otherwise (`archive: false` un-archives); fewer than two
 * members always archive.
 */
export function decideArchive(
  caller: { isAdmin: boolean },
  before: HouseholdModel | undefined,
  preparedArchive: boolean,
  requested: boolean | undefined,
): boolean | undefined {
  if (before?.isArchived === true && !caller.isAdmin) return undefined;
  const wanted = caller.isAdmin ? (requested ?? before?.isArchived ?? false) : false;
  return preparedArchive || wanted;
}

/** After an erasure removed a member: payer/contact no longer in `memberKeys` move to the first remaining member; fewer than 2 members archive. */
export function householdAfterErasure(d: Record<string, unknown>): Record<string, unknown> {
  const memberKeys = Array.isArray(d['memberKeys']) ? (d['memberKeys'] as string[]) : [];
  const fallback = memberKeys[0] ?? '';
  const fix = (v: unknown): string => (typeof v === 'string' && v !== '' && !memberKeys.includes(v) ? fallback : (v as string) ?? '');
  const out: Record<string, unknown> = { payerKey: fix(d['payerKey']), contactKey: fix(d['contactKey']) };
  if (memberKeys.length < 2) out['isArchived'] = true;
  return out;
}

/** The bundle from untrusted input: exactly the three known keys, booleans only, anything else = the default. */
export function coerceBundle(value: unknown): HouseholdBundle {
  const b = value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const pick = (k: keyof HouseholdBundle): boolean => (typeof b[k] === 'boolean' ? (b[k] as boolean) : DEFAULT_HOUSEHOLD_BUNDLE[k]);
  return { post: pick('post'), email: pick('email'), inApp: pick('inApp') };
}
