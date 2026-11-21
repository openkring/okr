/** Pure rules of the `saveHousehold` callable (spec 1.168). */
import { DEFAULT_HOUSEHOLD_BUNDLE, HouseholdModel } from '@okr/shared-models';
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
