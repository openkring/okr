/**
 * Pure planning for restrict-allocation-to-bka.mjs (spec 1.101 §6, phase 0). No Firestore here.
 */
export const ROW_NAME = 'aoc-allocation';
export const OPERATOR_TENANT = 'bka';
export const OPERATOR_URL = '/operator/allocation';

const arr = (v) => (Array.isArray(v) ? v : []);

export function planRowDocs(docs) {
  return docs.map((d) => {
    const tenants = arr(d.tenants);
    const bkaOnly = tenants.length === 1 && tenants[0] === OPERATOR_TENANT;
    // A fork is only rewritten when it is already exactly bka's; any other tenant set (another
    // tenant alone, or bka shared with one) would lose tenants on the overwrite — decide by hand.
    if (d.forkedFrom && !bkaOnly) {
      return { id: d.id, action: 'conflict', reason: `fork owned by [${tenants.join(', ')}] — decide by hand` };
    }
    // An unforked row without bka is not the shared row: handing it to bka would be wrong.
    if (!d.forkedFrom && !tenants.includes(OPERATOR_TENANT)) {
      return { id: d.id, action: 'conflict', reason: `row not shared with bka [${tenants.join(', ')}] — decide by hand` };
    }
    const done = bkaOnly && d.url === OPERATOR_URL;
    return done
      ? { id: d.id, action: 'skip', reason: 'already bka-only on the operator url' }
      : { id: d.id, action: 'restrict', reason: `tenants [${tenants.join(', ')}] → [${OPERATOR_TENANT}], url ${d.url} → ${OPERATOR_URL}` };
  });
}

export function planParentDocs(docs) {
  return docs.map((d) => {
    const tenants = arr(d.tenants);
    if (!arr(d.menuItems).includes(ROW_NAME)) return { id: d.id, action: 'skip', reason: 'does not list the row' };
    if (!tenants.includes(OPERATOR_TENANT)) return { id: d.id, action: 'detach', reason: `remove ${ROW_NAME} for [${tenants.join(', ')}]` };
    if (tenants.length === 1) return { id: d.id, action: 'skip', reason: 'bka keeps the row' };
    return { id: d.id, action: 'conflict', reason: `shared by bka and [${tenants.filter((t) => t !== OPERATOR_TENANT).join(', ')}] — fork it first` };
  });
}
