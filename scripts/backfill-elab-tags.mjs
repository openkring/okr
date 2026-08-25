/**
 * ONE-OFF — give tenant `elab` a tag definition for every tagModel (2026-08-25).
 *
 * `elab` was provisioned with ZERO documents in `tags`. That is not cosmetic: per the
 * `tag-model` skill an UNKNOWN tag invalidates an entire edit form, so a tenant with no tag
 * definitions can silently fail to save records. Nothing seeds them — no feature block declares
 * a `seed:` spec — so a newly provisioned tenant starts empty and stays empty.
 *
 * Unlike `icons`, tags are NOT moved to the SYSTEM_TENANT sentinel: a tag definition is
 * genuinely per-tenant tunable (its labels, its allowed values) and already uses the
 * copy-on-write fork model, which the read-only sentinel cannot express. So `elab` joins the
 * existing shared definitions the normal way — appended to `tenants[]`, free to fork later.
 *
 * For each tagModel it joins the WIDEST-shared document, which is the base definition; a
 * narrower one is another tenant's fork and must not be joined.
 *
 * Dry-run by default; `--apply` writes.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const TENANT = 'elab';
const APPLY = process.argv.includes('--apply');
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const snap = await db.collection('tags').get();
const byModel = new Map();
for (const d of snap.docs) byModel.set(d.data().tagModel, [...(byModel.get(d.data().tagModel) ?? []), d]);

let n = 0;
for (const [model, docs] of [...byModel].sort()) {
  if (docs.some(d => (d.data().tenants ?? []).includes(TENANT))) continue;
  const base = docs.slice().sort((a, b) => (b.data().tenants ?? []).length - (a.data().tenants ?? []).length)[0];
  n++;
  if (APPLY) await base.ref.update({ tenants: FieldValue.arrayUnion(TENANT) });
}
console.log(APPLY ? `>>> APPLIED — ${TENANT} joined ${n} tag definitions.`
                  : `>>> DRY RUN — would join ${n} tag definitions for ${TENANT}.`);
