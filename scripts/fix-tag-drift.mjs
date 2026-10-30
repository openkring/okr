/**
 * ONE-OFF — repair records whose tags are missing from their tenant's tag definition (2026-10-30).
 *
 * `tagValidations` rejects any tag that is not in the tenant's `tags` definition, which makes the
 * WHOLE edit form invalid — the change-confirmation never appears and the record cannot be saved.
 * An audit found ~2300 such records. Three causes, three repairs:
 *
 * 1. Values that were never added to the definition (icons, p13 calevents, document `@tag.album`
 *    and `@tag.finance`, section `@tag.pending`, …) → extend the definition. A value only one
 *    tenant uses goes into a copy-on-write fork for that tenant (tag-model skill), never into the
 *    shared definition.
 * 2. Legacy bare tags (`selectable`) where the definition holds the key (`@tag.selectable`)
 *    → rewrite the record's tag to the key.
 * 3. Tags that carry no meaning: `@tag.<tenant>` on documents (nothing reads it; tenants[] already
 *    scopes the record; extractTagsFromStoragePath no longer writes it) and the `test,bka` import
 *    marker on bka transfers → drop.
 *
 * Whatever is still unresolved afterwards is listed and left untouched.
 * Dry-run by default; `--apply` writes.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const split = (s) => (typeof s === 'string' ? s : '').split(',').map((t) => t.trim()).filter(Boolean);
const keys = (...names) => names.map((n) => `@tag.${n}`);

// tagModel → collection (only the ones the audit found drift in)
const COLLECTIONS = {
  icon: 'icons', document: 'docs', calevent: 'calevents', group: 'groups', location: 'locations',
  membership: 'memberships', org: 'orgs', ownership: 'ownerships', person: 'persons',
  section: 'sections', transfer: 'transfers',
};

// 1a. values added to the definition every listed tenant shares
const ICON_VALUES = ['action', 'address', 'calendar', 'cms', 'comm', 'currency', 'doc', 'eatdrink', 'event',
  'filetypes', 'geo', 'language', 'media', 'navigation', 'notification', 'org', 'ownership', 'person',
  'relationship', 'resource', 'section', 'security', 'sport', 'task', 'time', 'traffic', 'weather'];
const SHARED_ADD = {
  icon: ICON_VALUES,
  document: keys('album', 'finance', 'marketing'),
  section: keys('pending'),
  location: keys('diary'),
  person: keys('jstrainer'),
};
// 1b. values only one tenant uses → copy-on-write fork for that tenant
const FORK_ADD = {
  calevent: { p13: keys('tour', 'history', 'museum', 'sport', 'culture', 'military', 'industry', 'nature', 'jubilee', 'carriage', 'religion') },
  ownership: { scs: keys('cgig', 'jole') },
};
// values removed from a definition (the tenant tag no longer exists)
const REMOVE = { document: keys('scs') };

// 2./3. record rewrites
const ICON_SPLIT = { 'event calendar': ['event', 'calendar'] };
const TRANSFER_DROP = new Set(['test', 'bka']);

const tenantIds = new Set((await db.collection('app-config').get()).docs.map((d) => d.id));

// ---------- definitions ----------
const defSnap = await db.collection('tags').get();
const defs = defSnap.docs
  .filter((d) => !d.data().isArchived && Array.isArray(d.data().tenants))
  .map((d) => ({ ref: d.ref, id: d.id, ...d.data(), values: split(d.data().tags) }));
const defOps = []; // { describe, apply(batch) }

const sep = (raw) => (typeof raw === 'string' && raw.includes(', ') ? ', ' : ',');
for (const def of defs) {
  const add = (SHARED_ADD[def.tagModel] ?? []).filter((v) => !def.values.includes(v));
  const drop = (REMOVE[def.tagModel] ?? []).filter((v) => def.values.includes(v));
  if (!add.length && !drop.length) continue;
  const next = [...def.values.filter((v) => !drop.includes(v)), ...add];
  def.values = next;
  const tags = next.join(sep(def.tags));
  defOps.push({ describe: `tags/${def.id} (${def.tagModel} ${def.tenants.join(',')}): +[${add.join(' ')}] -[${drop.join(' ')}]`,
    apply: (b) => b.update(def.ref, { tags }) });
}
for (const [model, perTenant] of Object.entries(FORK_ADD)) {
  for (const [tenant, add] of Object.entries(perTenant)) {
    const source = defs.find((d) => d.tagModel === model && d.tenants.includes(tenant));
    if (!source) throw new Error(`no ${model} definition for ${tenant}`);
    const missing = add.filter((v) => !source.values.includes(v));
    if (!missing.length) continue;
    if (source.tenants.length === 1) { // already the tenant's own definition → extend in place
      source.values = [...source.values, ...missing];
      const tags = source.values.join(sep(source.tags));
      defOps.push({ describe: `tags/${source.id} (${model} ${tenant}): +[${missing.join(' ')}]`, apply: (b) => b.update(source.ref, { tags }) });
      continue;
    }
    const forkRef = db.collection('tags').doc(); // random id (tag-model skill)
    const values = [...source.values, ...missing];
    const fork = { tagModel: model, isArchived: false, tenants: [tenant], tags: values.join(sep(source.tags)) };
    source.tenants = source.tenants.filter((t) => t !== tenant);
    defs.push({ ref: forkRef, id: forkRef.id, ...fork, values });
    // both halves in one batch: the fork AND the removal from the shared source
    defOps.push({ describe: `FORK ${model} for ${tenant} from tags/${source.id} → tags/${forkRef.id}: +[${missing.join(' ')}]`,
      apply: (b) => { b.set(forkRef, fork); b.update(source.ref, { tenants: FieldValue.arrayRemove(tenant) }); } });
  }
}

const allowedFor = (model, tenant) => {
  const def = defs.find((d) => d.tagModel === model && d.tenants.includes(tenant));
  return def ? new Set(def.values) : undefined; // undefined = no definition → tagValidations skips
};
const viewerTenants = (x) => ((x.tenants ?? []).includes('system')
  ? [...new Set(defs.flatMap((d) => d.tenants))].filter((t) => t !== 'system' && t !== 'default')
  : (x.tenants ?? []));

// ---------- records ----------
const recOps = [];
const unresolved = new Map(); // `${model} ${tag}` → count
const stats = new Map();

for (const [model, col] of Object.entries(COLLECTIONS)) {
  const snap = await db.collection(col).get();
  for (const d of snap.docs) {
    const x = d.data();
    if (x.isArchived) continue;
    const raw = split(x.tags);
    if (!raw.length) continue;
    const viewers = viewerTenants(x);
    const sets = viewers.map((t) => allowedFor(model, t)).filter(Boolean);
    const ok = (tag) => sets.every((s) => s.has(tag));

    const out = [];
    for (const tag of raw.flatMap((t) => (model === 'icon' && ICON_SPLIT[t]) || [t])) {
      if (model === 'document' && tag.startsWith('@tag.') && tenantIds.has(tag.slice(5))) continue; // tenant tag
      if (model === 'transfer' && TRANSFER_DROP.has(tag) && (x.tenants ?? []).includes('bka')) continue;
      if (ok(tag)) { out.push(tag); continue; }
      if (!tag.startsWith('@') && ok(`@tag.${tag}`)) { out.push(`@tag.${tag}`); continue; }
      out.push(tag);
      unresolved.set(`${model} ${tag}`, (unresolved.get(`${model} ${tag}`) ?? 0) + 1);
    }
    const next = [...new Set(out)].join(',');
    if (next === raw.join(',') && next === x.tags) continue;
    if (next === raw.join(',') && x.tags.replace(/\s/g, '') === next.replace(/\s/g, '')) continue; // spacing only
    stats.set(col, (stats.get(col) ?? 0) + 1);
    recOps.push({ col, id: d.id, from: x.tags, to: next, apply: (b) => b.update(d.ref, { tags: next }) });
  }
}

// ---------- report ----------
console.log('=== tag definitions ===');
for (const op of defOps) console.log('  ' + op.describe);
console.log('\n=== records ===');
for (const [col, n] of stats) {
  console.log(`  ${col}: ${n}`);
  const samples = new Map();
  for (const r of recOps.filter((r) => r.col === col)) {
    const k = `${r.from} → ${r.to || "''"}`;
    samples.set(k, (samples.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...samples].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${n}× ${k}`);
}
if (unresolved.size) {
  console.log('\n=== still unresolved (left untouched) ===');
  for (const [k, n] of unresolved) console.log(`  ${k} (${n})`);
}

if (!APPLY) {
  console.log(`\n>>> DRY RUN — ${defOps.length} definition ops, ${recOps.length} record updates. Re-run with --apply.`);
} else {
  const defBatch = db.batch();
  for (const op of defOps) op.apply(defBatch);
  await defBatch.commit();
  for (let i = 0; i < recOps.length; i += 400) {
    const b = db.batch();
    for (const op of recOps.slice(i, i + 400)) op.apply(b);
    await b.commit();
  }
  console.log(`\n>>> APPLIED — ${defOps.length} definition ops, ${recOps.length} record updates.`);
}
