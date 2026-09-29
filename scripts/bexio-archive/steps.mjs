/**
 * The export steps of scripts/migrate-bexio-archive.mjs (spec 1.68 §4.2). Each step takes
 * ctx = { db, bucket, bexio, tenantId, dry } and returns a counts object. Every write uses a
 * deterministic okey and merge, so a step can be re-run safely.
 */

export const STEPS = {};

/** Finance docs of the accounting tenant (both tenancy fields, as every finance query must). */
export async function localDocs(db, collection, tenantId) {
  const snap = await db.collection(collection)
    .where('tenants', 'array-contains', tenantId).where('accountingTenantId', '==', tenantId).get();
  return snap.docs;
}

/** Commits writes in chunks of 400; in dry mode only counts. `ops` = [{ ref, data?, del? }]. */
export async function commitOps(db, ops, dry) {
  if (dry) return ops.length;
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) {
      if (op.del) batch.delete(op.ref); else batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }
  return ops.length;
}
