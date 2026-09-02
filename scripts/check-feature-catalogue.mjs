/**
 * CATALOGUE DRIFT CHECK — does `feature-blocks.ts` still agree with the live menu data?
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY
 * ─────────────────────────────────────────────────────────────────────────────────────
 * The catalogue's 245 menu specs were transcribed from live `menuItems` documents and are
 * kept in sync BY HAND. Nothing enforced that: no test, no build step, no release gate.
 * Every correction made in Firestore that was not back-ported into the catalogue sat there
 * as a pending revert, waiting for the next «Katalog-Werte übernehmen» to overwrite it — with no
 * warning at the moment of the edit and no trace afterwards. Commit 170fe4617 ("sync
 * membership-copyemail's role with the live doc") is that back-port done manually; ba74a8f5e,
 * a6d07bd4c and 487e1fea9 are three more.
 *
 * This script closes the loop: it reports every live document whose catalogue-owned fields
 * (`url`, `action`, `roleNeeded`) differ from the spec, per tenant, and exits non-zero for the
 * ones that are genuinely a problem — see "A FORK IS NOT AN ERROR" below.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────────────
 * It never writes. Drift is not automatically an error in either direction: sometimes the
 * catalogue is stale (back-port the live value into `feature-blocks.ts`), sometimes the live
 * document is (run «Katalog-Werte übernehmen» in `/tenant/features`). Deciding which is a human
 * call — the script's job is to make sure the decision is made deliberately rather than by
 * whoever saves the picker next.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * A FORK IS NOT AN ERROR
 * ─────────────────────────────────────────────────────────────────────────────────────
 * A document with `forkedFrom` set is a tenant's deliberate copy — the fork-on-edit rule
 * (D-BB-8) creates it the moment an admin changes a shared menu item in the CMS editor, and
 * differing from the catalogue is the entire point of its existence. Counting those as
 * failures made the release gate ask the same unanswerable question forever: of the first
 * run's 13 distinct decisions, 9 were forks that will never "resolve".
 *
 * So the two are separated. NON-FORKED divergence is real drift and sets the exit code —
 * the catalogue and a shared document disagree and one of them is stale. FORKED divergence
 * is REPORTED but never fatal. It is still reported, and deliberately so: §5 of the design
 * exists because a fork silently misses later catalogue structural fixes, and a fork that
 * quietly diverged on a field nobody meant to customise is exactly what this list surfaces.
 *
 * It reuses the runtime's OWN functions (`effectiveFeatures`, `indexMenuDocsByName`,
 * `findStructuralDrift`) rather than reimplementing the comparison, so the report and the
 * write can never disagree — the same argument `findStructuralDrift` itself records.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * IT ALSO GENERATES THE REFERENCE DOC (--write-doc)
 * ─────────────────────────────────────────────────────────────────────────────────────
 * 245 menu specs across 35 blocks is past the size where anyone reads the source to answer
 * "what does this catalogue actually apply". `--write-doc` renders the whole thing —
 * bundles, blocks, the dependency graph, the per-tenant matrix, the profiles and the current
 * drift — into `planning/reference/feature-matrix.md`. Generated, never hand-edited, for the
 * reason `DATA_MODEL.md` keeps proving: a hand-maintained snapshot of 245 rows is a snapshot
 * of whatever was true the last time somebody remembered.
 *
 * Note what the two views are: the sitemap `graph` page shows the LIVE menu tree, this shows
 * the catalogue's INTENDED structure, and the difference between them is the drift report.
 *
 * Usage:
 *   node scripts/check-feature-catalogue.mjs                 # all tenants, exit 1 on drift
 *   node scripts/check-feature-catalogue.mjs --tenant=scs    # one tenant
 *   node scripts/check-feature-catalogue.mjs --json          # machine-readable
 *   node scripts/check-feature-catalogue.mjs --quiet         # summary line only
 *   node scripts/check-feature-catalogue.mjs --write-doc     # + regenerate the reference doc
 *   pnpm catalogue:check / pnpm catalogue:doc
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createJiti } from 'jiti';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// The catalogue and its resolution helpers are TypeScript and are the single source of
// truth; jiti (already a devDependency, used by the Nx toolchain) loads them directly, the
// same way `backfill-enabled-features.mjs` does, so this check can never drift from a
// hand-copied duplicate of the very logic it is checking.
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { FEATURE_BLOCKS, FEATURE_BUNDLES } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/feature-blocks.ts'));
const { effectiveFeatures } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/feature-rollout.util.ts'));
const { indexMenuDocsByName, findStructuralDrift, menuSpecNames } =
  await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/menu-seed.util.ts'));
const { FEATURE_PROFILES, closestProfile } =
  await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/feature-profiles.ts'));

const ARGS = process.argv.slice(2);
const has = (flag) => ARGS.includes(flag);
const valueOf = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const TENANT = valueOf('tenant');
const JSON_OUT = has('--json');
const QUIET = has('--quiet');
const WRITE_DOC = has('--write-doc') || valueOf('write-doc') !== undefined;
const DOC_PATH = path.join(ROOT, valueOf('write-doc') ?? 'planning/reference/feature-matrix.md');

const APP_CONFIG = 'app-config';
const MENU_ITEMS = 'menuItems';
const FEATURE_ROLLOUT = 'feature-rollout';

const log = (...a) => { if (!JSON_OUT && !QUIET) console.log(...a); };

function pad(s, n) { return String(s).padEnd(n); }

// ── read ────────────────────────────────────────────────────────────────────────────
if (!getApps().length) initializeApp();
const db = getFirestore();

const [configSnap, rolloutSnap, menuSnap] = await Promise.all([
  db.collection(APP_CONFIG).get(),
  db.collection(FEATURE_ROLLOUT).get(),
  // UNSCOPED on purpose — exactly like `applySelection`. Menu docs are globally shared and
  // a tenant inherits one through `tenants[]`; a filtered read could not see the document
  // the seed would extend, so the resolution ladder needs the whole collection.
  db.collection(MENU_ITEMS).get(),
]);

const rollouts = rolloutSnap.docs.map((d) => ({ okey: d.id, ...d.data() }));
const menuDocs = menuSnap.docs.map((d) => ({ id: d.id, data: d.data() }));

let tenants = configSnap.docs
  .map((d) => ({ tenantId: d.id, config: d.data() }))
  .sort((a, b) => a.tenantId.localeCompare(b.tenantId));

if (TENANT) {
  tenants = tenants.filter((t) => t.tenantId === TENANT);
  if (tenants.length === 0) {
    console.error(`\nUnknown tenant '${TENANT}'. Known: ${configSnap.docs.map((d) => d.id).join(', ')}\n`);
    process.exit(2);
  }
}

// ── analyse ─────────────────────────────────────────────────────────────────────────
const report = [];

for (const { tenantId, config } of tenants) {
  // NOT coalesced to []: an undefined `enabledFeatures` means "every non-internal block"
  // (D-BB-10), and coalescing it here would report a legacy tenant as having no blocks and
  // therefore no drift — a clean bill of health for the tenants most likely to have drifted.
  const live = effectiveFeatures({
    catalogue: FEATURE_BLOCKS,
    rollouts,
    enabled: config.enabledFeatures,
    tenantId,
  });

  const blocks = FEATURE_BLOCKS.filter((b) => live.has(b.id));
  const specs = blocks.flatMap((b) => b.menu);
  const { byName, ambiguous } = indexMenuDocsByName(menuDocs, tenantId);

  // Only names THIS tenant's seed would write matter — an ambiguity elsewhere in the
  // globally shared collection is somebody else's data problem, exactly as `applySelection`
  // scopes its own refusal.
  const touched = new Set([...specs.flatMap((s) => menuSpecNames([s])), `main_${tenantId}`]);
  const blocking = ambiguous.filter((a) => touched.has(a.name));

  // `findStructuralDrift` reports both sides per SPEC — the catalogue value it WOULD write and
  // the value the live document carries — because which half is stale is a human call and a
  // report that shows only one of them cannot be judged.
  //
  // Flattened to one entry per (document, field, catalogue value): a name declared by two
  // blocks — the shared-parent pattern — is visited once per spec and would otherwise be
  // reported twice for one overwrite. The catalogue VALUE stays part of the identity, so two
  // blocks declaring DIFFERENT values for one field still show up as the two conflicting
  // entries they are, rather than collapsing into a single arbitrary winner.
  const seen = new Set();
  const changes = [];
  for (const d of findStructuralDrift(specs, byName)) {
    for (const [field, to] of Object.entries(d.fields)) {
      const identity = `${d.docId}|${field}|${to}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      changes.push({
        name: d.name, docId: d.docId, forked: d.forked, field,
        from: String(d.live[field] ?? ''), to: String(to),
      });
    }
  }

  const nearest = closestProfile(FEATURE_BLOCKS, FEATURE_PROFILES, live);

  report.push({
    tenantId,
    blocks: blocks.length,
    specs: specs.reduce((n, s) => n + menuSpecNames([s]).length, 0),
    effective: [...live].sort(),
    profile: nearest ? { id: nearest.profile.id, ...nearest.deviation } : undefined,
    // Real drift: the catalogue and a SHARED document disagree, so one of them is stale.
    changes: changes.filter((c) => !c.forked),
    // A tenant's own copy diverging is what a fork is for — reported, never fatal.
    forks: changes.filter((c) => c.forked),
    blocking,
  });
}

// ── output ──────────────────────────────────────────────────────────────────────────
const totalDrift = report.reduce((n, r) => n + r.changes.length, 0);
const totalForks = report.reduce((n, r) => n + r.forks.length, 0);
const totalBlocking = report.reduce((n, r) => n + r.blocking.length, 0);
// Only non-forked divergence and unresolvable names are failures — see "A FORK IS NOT AN
// ERROR" above. A run whose only findings are forks exits 0 and stays quiet in the gate.
const failed = totalDrift > 0 || totalBlocking > 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ totalDrift, totalForks, totalBlocking, tenants: report }, null, 2));
} else {
  log('\nFEATURE CATALOGUE DRIFT CHECK');
  log('═'.repeat(96));

  for (const r of report) {
    log(`\n${r.tenantId}  —  ${r.blocks} aktive Blöcke, ${r.specs} Menü-Specs`);
    if (r.profile) {
      const gaps = [
        r.profile.missing.length > 0 ? `fehlt: ${r.profile.missing.join(', ')}` : '',
        r.profile.extra.length > 0 ? `zusätzlich: ${r.profile.extra.join(', ')}` : '',
      ].filter(Boolean).join(' · ');
      log(`  Profil ${r.profile.id}${gaps ? ` — ${gaps}` : ' — exakt'}`);
    }

    if (r.changes.length === 0 && r.forks.length === 0 && r.blocking.length === 0) {
      log('  ✓ keine Abweichung');
    }

    const rows = (list) => {
      for (const c of list) {
        log(`    ${pad(c.name, 28)}${pad(c.field, 12)}${c.from || '∅'} → ${c.to}`);
        if (c.docId !== c.name) log(`    ${' '.repeat(28)}doc: ${c.docId}`);
      }
    };

    if (r.changes.length > 0) {
      log(`  ABWEICHUNG (geteilte Dokumente — eine Seite ist veraltet)`);
      log(`    ${pad('NAME', 28)}${pad('FELD', 12)}LIVE → KATALOG`);
      rows(r.changes);
    }

    if (r.forks.length > 0) {
      log(`  EIGENE KOPIEN (bewusste Abweichung — nur zur Kenntnis)`);
      log(`    ${pad('NAME', 28)}${pad('FELD', 12)}LIVE → KATALOG`);
      rows(r.forks);
    }

    for (const a of r.blocking) {
      log(`  ⚠ name '${a.name}' ist für diesen Mandanten nicht eindeutig auflösbar ` +
        `(Kandidaten: ${a.ids.join(', ')}) — applyFeatureSelection würde verweigern`);
    }
  }

  log('\n' + '═'.repeat(96));
}

// ── the reference doc (proposal 7) ──────────────────────────────────────────────────
/**
 * Renders the catalogue's INTENDED structure plus the live per-tenant picture. Regenerated,
 * never hand-edited — the header says so, because a generated file that looks editable gets
 * edited, and the edit is lost on the next run without anyone noticing.
 */
function renderDoc() {
  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map(FEATURE_BLOCKS.map((b) => [b.id, b]));
  const specCount = (b) => menuSpecNames(b.menu).length;
  const total = FEATURE_BLOCKS.reduce((n, b) => n + specCount(b), 0);
  const tenantIds = report.map((r) => r.tenantId);
  const out = [];

  out.push('# Feature-Katalog — Struktur, Abhängigkeiten und Mandanten-Matrix', '');
  out.push('> **GENERIERT — nicht von Hand bearbeiten.**',
    `> Erzeugt am ${today} mit \`pnpm catalogue:doc\` aus \`libs/tenant/util/src/lib/feature-blocks.ts\``,
    '> und den Live-Daten in `app-config` / `feature-rollout` / `menuItems`.',
    '> Jede Änderung hier wird beim nächsten Lauf überschrieben; ändere den Katalog.', '');
  out.push(`${FEATURE_BLOCKS.length} Bausteine in ${FEATURE_BUNDLES.length} Bündeln, ` +
    `${total} Menü-Specs, ${FEATURE_BLOCKS.filter((b) => b.core).length} davon core (immer aktiv). ` +
    `${report.length} Mandanten mit Konfigurations-Dokument.`, '');
  out.push('Der Sitemap-`graph` im Admin zeigt den **Live**-Menübaum; dieses Dokument zeigt die',
    '**Soll**-Struktur des Katalogs. Die Differenz ist der Drift-Report am Ende.', '');

  // ── profiles ──
  out.push('## Profile', '');
  out.push('Benannte Baustein-Auswahlen (`libs/tenant/util/src/lib/feature-profiles.ts`), streng',
    'geschachtelt. Ein Profil ist ein Vorschlag, keine Vorgabe — der Picker setzt damit nur die',
    'Häkchen, gespeichert wird weiterhin über die normalen Bestätigungen.', '');
  out.push('| Profil | Bausteine | Inhalt |', '|---|---:|---|');
  for (const p of FEATURE_PROFILES) {
    out.push(`| \`${p.id}\` | ${p.blocks.length} | ${p.blocks.map((b) => `\`${b}\``).join(', ')} |`);
  }
  out.push('');
  out.push('### Abstand der Mandanten vom nächstgelegenen Profil', '');
  out.push('| Mandant | nächstes Profil | fehlt | zusätzlich |', '|---|---|---|---|');
  for (const r of report) {
    const p = r.profile;
    out.push(`| \`${r.tenantId}\` | ${p ? `\`${p.id}\`` : '—'} | ` +
      `${p && p.missing.length ? p.missing.map((b) => `\`${b}\``).join(', ') : '—'} | ` +
      `${p && p.extra.length ? p.extra.map((b) => `\`${b}\``).join(', ') : '—'} |`);
  }
  out.push('');

  // ── matrix ──
  out.push('## Features je Mandant', '');
  out.push('`x` = aktiviert, `C` = core (immer an, unabhängig von `enabledFeatures`), `·` = aus.',
    'Abgeleitet mit `effectiveFeatures` — also Katalog ∩ Rollout ∩ `enabledFeatures`, nicht die',
    'rohe Liste im Dokument.', '');
  out.push(`| Baustein | Bündel | Verfügbarkeit | ${tenantIds.join(' | ')} |`,
    `|---|---|---|${tenantIds.map(() => '---|').join('')}`);
  for (const bundle of FEATURE_BUNDLES) {
    for (const b of FEATURE_BLOCKS.filter((x) => x.bundle === bundle.id)) {
      const cells = report.map((r) =>
        b.core ? 'C' : (r.effective.includes(b.id) ? 'x' : '·'));
      out.push(`| \`${b.id}\` | ${b.bundle} | ${b.defaultAvailability}` +
        `${b.core ? ' · core' : ''} | ${cells.join(' | ')} |`);
    }
  }
  out.push(`| **aktive Bausteine** | | | ${report.map((r) => `**${r.blocks}**`).join(' | ')} |`);
  out.push(`| **Menü-Specs** | | | ${report.map((r) => `**${r.specs}**`).join(' | ')} |`, '');

  // ── blocks ──
  out.push('## Bausteine', '');
  out.push('| Baustein | Bündel | hängt ab von | Menü-Specs | Collections |', '|---|---|---|---:|---|');
  for (const bundle of FEATURE_BUNDLES) {
    for (const b of FEATURE_BLOCKS.filter((x) => x.bundle === bundle.id)) {
      out.push(`| \`${b.id}\` | ${b.bundle} | ` +
        `${b.dependsOn.length ? b.dependsOn.map((d) => `\`${d}\``).join(', ') : '—'} | ` +
        `${specCount(b)} | ${b.collections.length ? b.collections.join(', ') : '—'} |`);
    }
  }
  out.push('');

  // ── dependency graph ──
  out.push('## Abhängigkeiten', '');
  out.push('Ein Baustein zieht seine `dependsOn` mit — `resolveWithDeps` aktiviert sie beim',
    'Speichern still mit. Bausteine ohne Kanten sind weggelassen.', '');
  out.push('```mermaid', 'graph LR');
  const linked = new Set();
  const edges = [];
  for (const b of FEATURE_BLOCKS) {
    for (const dep of b.dependsOn) {
      if (!byId.has(dep)) continue;
      edges.push(`  ${b.id.replace(/-/g, '_')} --> ${dep.replace(/-/g, '_')}`);
      linked.add(b.id); linked.add(dep);
    }
  }
  for (const id of [...linked].sort()) {
    out.push(`  ${id.replace(/-/g, '_')}["${id}"]`);
  }
  out.push(...edges);
  out.push('```', '');

  // ── drift ──
  out.push('## Abweichung zwischen Katalog und Live-Daten', '');
  const changeRows = report.reduce((n, r) => n + r.changes.length, 0);
  const forkRows = report.reduce((n, r) => n + r.forks.length, 0);
  const table = (list) => {
    out.push('| Mandant | Eintrag | Feld | live | Katalog |', '|---|---|---|---|---|');
    for (const [tenantId, c] of list) {
      out.push(`| \`${tenantId}\` | \`${c.name}\` | ${c.field} | ` +
        `\`${c.from || '∅'}\` | \`${c.to}\` |`);
    }
    out.push('');
  };

  out.push('### Geteilte Dokumente', '');
  if (changeRows === 0) {
    out.push('Keine. Katalog und geteilte Live-Dokumente stimmen für alle geprüften Mandanten',
      'überein.', '');
  } else {
    out.push(`${changeRows} Felder weichen ab. Eine Seite ist veraltet, und welche, ist eine`,
      'Entscheidung: den Live-Wert nach `feature-blocks.ts` zurückportieren, oder im Picker',
      '«Katalog-Werte übernehmen» laufen lassen. Diese Abweichungen lassen `pnpm catalogue:check`',
      'mit einem Fehlercode enden.', '');
    table(report.flatMap((r) => r.changes.map((c) => [r.tenantId, c])));
  }

  out.push('### Eigene Kopien (Forks)', '');
  if (forkRows === 0) {
    out.push('Keine.', '');
  } else {
    out.push(`${forkRows} Felder in mandanteneigenen Kopien weichen vom Katalog ab. Das ist der`,
      'Zweck einer Kopie — sie ist **kein Fehler** und beendet den Check nicht mit einem',
      'Fehlercode. Sie steht hier, weil eine Kopie spätere Struktur-Fixes aus dem Katalog nicht',
      'mitbekommt: eine Zeile, die unabsichtlich abweicht, fällt nur hier auf.', '');
    table(report.flatMap((r) => r.forks.map((c) => [r.tenantId, c])));
  }

  return out.join('\n');
}

if (WRITE_DOC) {
  mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  writeFileSync(DOC_PATH, renderDoc());
  if (!JSON_OUT) console.log(`\nGeschrieben: ${path.relative(ROOT, DOC_PATH)}`);
}

if (!JSON_OUT) {
  const forkNote = totalForks > 0 ? ` · ${totalForks} eigene Kopien (kein Fehler)` : '';
  const verdict = failed
    ? `✖ ${totalDrift} abweichende Felder, ${totalBlocking} nicht auflösbare Namen` +
      `${forkNote} (${report.length} Mandanten geprüft)`
    : `✓ Katalog und geteilte Live-Dokumente stimmen überein${forkNote} ` +
      `(${report.length} Mandanten geprüft)`;
  console.log(verdict + '\n');
}

process.exit(failed ? 1 : 0);
