/**
 * ONE-TIME DATA MIGRATION — the books are not the app tenant (2026-10-10, spec 1.65).
 *
 * The catalogued accounting menu opened `/accounting/@TID@/…`: the APP TENANT used as the
 * accountingTenantId. Tenant `scs` keeps the books `scs` AND `gss`; the shared name hid the mix-up.
 * The app now has a separate token `@BOOKS@` = `app-config.defaultAccountingTenantId`.
 *
 * PHASE `now` (safe with the released app, which ignores the new field):
 *   1. app-config/{tenant}.defaultAccountingTenantId for the tenants whose books exist
 *      (BOOKS below; bkg/okr get books later — their rows stay hidden until then).
 *   2. `project-all` moves into «Finanzen»: added to every live `finance-menu*` doc of a tenant whose
 *      root menu reaches `finance-menu`, and removed from that tenant's other menus. A tenant whose
 *      root menu does not reach `finance-menu` (elab, kwa) keeps it where it is.
 *   3. `scsf_fibu` (unused since the catalogued accounting-menu replaced it) and its `scsf_*` children
 *      that no other live menu references are archived (never deleted).
 *
 * PHASE `after-release` (needs the app release that knows `@BOOKS@`):
 *   4. every live `menuItems` url `/accounting…/@TID@/…` becomes `/accounting…/@BOOKS@/…`.
 *   (The `my-cost-centers` row is seeded by scripts/seed-my-cost-centers-menu.mjs, also after the release.)
 *
 * Usage:
 *   node scripts/migrate-books-token.mjs --phase=now               # dry run
 *   node scripts/migrate-books-token.mjs --phase=now --apply
 *   node scripts/migrate-books-token.mjs --phase=after-release [--apply]
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/** app tenant → its default books (accountingTenantId). Only books that exist. */
const BOOKS = { scs: 'scs', bka: 'bka' };

const apply = process.argv.includes('--apply');
const phase = (process.argv.find(a => a.startsWith('--phase=')) ?? '').slice('--phase='.length);
if (phase !== 'now' && phase !== 'after-release') {
  console.error('usage: --phase=now | --phase=after-release  [--apply]');
  process.exit(2);
}

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const log = (verb, msg) => console.log(`  ${apply ? verb.padEnd(12) : ('would ' + verb).padEnd(12)} ${msg}`);
  let writes = 0;
  const menuSnap = await db.collection('menuItems').get();
  const live = menuSnap.docs.filter(d => d.data().isArchived !== true);
  const byName = name => live.filter(d => d.data().name === name);

  if (phase === 'now') {
    console.log(`${apply ? 'APPLY' : 'DRY RUN'} — phase now\n`);
    // 1. app-config
    for (const [tenant, books] of Object.entries(BOOKS)) {
      const ref = db.collection('app-config').doc(tenant);
      const cur = (await ref.get()).data()?.defaultAccountingTenantId ?? '';
      const cfg = await db.collection('accounting-configs').doc(books).get();
      if (!cfg.exists || !(cfg.data().tenants ?? []).includes(tenant)) { console.log(`  skip        app-config/${tenant}: books ${books} missing or not ${tenant}'s`); continue; }
      if (cur === books) { console.log(`  ok          app-config/${tenant}.defaultAccountingTenantId = ${books}`); continue; }
      if (apply) await ref.update({ defaultAccountingTenantId: books });
      log('update', `app-config/${tenant}.defaultAccountingTenantId: '${cur}' → '${books}'`);
      writes++;
    }

    // 2. project-all → finance-menu
    const tenantsOf = d => d.data().tenants ?? [];
    const reaches = (rootName, target, tenant) => {
      const seen = new Set();
      const walk = name => {
        if (seen.has(name)) return false;
        seen.add(name);
        const docs = byName(name).filter(d => tenantsOf(d).includes(tenant));
        return docs.some(d => (d.data().menuItems ?? []).some(k => k === target || walk(k)));
      };
      return walk(rootName);
    };
    const holders = live.filter(d => (d.data().menuItems ?? []).includes('project-all'));
    const tenants = [...new Set(holders.flatMap(tenantsOf))].sort();
    for (const tenant of tenants) {
      const financeDocs = live.filter(d => d.data().name?.startsWith('finance-menu') && tenantsOf(d).includes(tenant))
        // a tenant-specific fork (finance-menu_<tenant>) wins over the shared doc
        .sort((a, b) => (b.id === `finance-menu_${tenant}`) - (a.id === `finance-menu_${tenant}`));
      const finance = financeDocs[0];
      if (!finance || !reaches(`main_${tenant}`, 'finance-menu', tenant)) {
        console.log(`  keep        ${tenant}: root menu does not reach finance-menu — project-all stays where it is`);
        continue;
      }
      if (!(finance.data().menuItems ?? []).includes('project-all')) {
        const kids = [...finance.data().menuItems];
        const at = kids.indexOf('invoice-my');
        kids.splice(at >= 0 ? at + 1 : kids.length, 0, 'project-all');
        if (apply) await finance.ref.update({ menuItems: kids });
        finance.data = (() => { const d = { ...finance.data(), menuItems: kids }; return () => d; })();
        log('update', `menuItems/${finance.id} (${tenant}): add project-all`);
        writes++;
      }
      // remove from every other menu that only this tenant (or tenants all reaching finance) uses
      for (const h of holders.filter(d => d.id !== finance.id && tenantsOf(d).includes(tenant))) {
        const others = tenantsOf(h).filter(t => t !== tenant);
        const blocked = others.filter(t => !reaches(`main_${t}`, 'finance-menu', t));
        if (blocked.length > 0) { console.log(`  keep        menuItems/${h.id}: shared with ${blocked.join(',')} (no finance-menu there)`); continue; }
        const kids = (h.data().menuItems ?? []).filter(k => k !== 'project-all');
        if (kids.length === (h.data().menuItems ?? []).length) continue;
        if (apply) await h.ref.update({ menuItems: kids });
        h.data = (() => { const d = { ...h.data(), menuItems: kids }; return () => d; })();
        log('update', `menuItems/${h.id}: remove project-all`);
        writes++;
      }
    }

    // 3. archive scsf_fibu and its exclusive scsf_* children
    const fibu = byName('scsf_fibu')[0];
    if (fibu) {
      const referencedElsewhere = name => live.some(d => d.id !== fibu.id && (d.data().menuItems ?? []).includes(name));
      if (referencedElsewhere('scsf_fibu')) console.log('  keep        scsf_fibu: still referenced by another menu');
      else {
        if (apply) await fibu.ref.update({ isArchived: true });
        log('archive', `menuItems/${fibu.id}`);
        writes++;
        for (const child of (fibu.data().menuItems ?? []).filter(k => k.startsWith('scsf_'))) {
          if (referencedElsewhere(child)) { console.log(`  keep        ${child}: referenced elsewhere`); continue; }
          for (const d of byName(child)) { if (apply) await d.ref.update({ isArchived: true }); log('archive', `menuItems/${d.id}`); writes++; }
        }
      }
    }
  } else {
    console.log(`${apply ? 'APPLY' : 'DRY RUN'} — phase after-release\n`);
    const re = /^(\/accounting[a-z-]*\/)@TID@\//;
    for (const d of live.filter(d => re.test(d.data().url ?? ''))) {
      const url = d.data().url.replace(re, '$1@BOOKS@/');
      if (apply) await d.ref.update({ url });
      log('update', `menuItems/${d.id}: ${d.data().url} → ${url}`);
      writes++;
    }
  }
  console.log(`\n${apply ? 'writes' : 'would write'}: ${writes}`);
  if (!apply) console.log('Re-run with --apply to write.');
}

main().catch(err => { console.error(err); process.exit(1); });
