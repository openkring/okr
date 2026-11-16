/**
 * ONE-TIME MIGRATION — the «Überzeile» (properties.kicker) becomes the section's intro.
 *
 * The base field `intro` now holds the Überzeile, and `introPosition` says where it is shown:
 *   properties.kicker (+ kickerI18n) → intro (+ properties.introI18n), introPosition 'above'
 * A section that already has an intro keeps it (and its position); its kicker is reported and dropped.
 * The old fields are deleted. Tiles sections are left alone: their kicker (and lead) belong to
 * migrate-tiles-section-fields.mjs (kicker → subTitle, lead → intro), which must run before or after this one
 * without the two fighting over `intro`.
 *
 * Order: run it AFTER the release that reads `intro` / `introPosition` (app and website renderer).
 * Until then the renderers fall back to properties.kicker, so nothing disappears in between; a release
 * still reading kicker would lose the Überzeile once this has run.
 *
 * Usage:
 *   node scripts/migrate-section-kicker-to-intro.mjs           # dry run (default)
 *   node scripts/migrate-section-kicker-to-intro.mjs --apply   # write
 * Requires: gcloud auth application-default login.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const OLD_FIELDS = ['kicker', 'kickerI18n'];

const hasText = (s) => typeof s === 'string' && s.trim().length > 0;
const hasI18n = (o) => !!o && typeof o === 'object' && Object.keys(o).length > 0;

/** The patch for one section, or undefined when it carries no kicker field. */
export function kickerPatch(doc) {
  if (doc.type === 'tiles') return undefined;
  const props = doc.properties ?? {};
  if (!OLD_FIELDS.some((f) => f in props)) return undefined;
  const patch = {};
  const notes = [];

  if (hasText(props.kicker)) {
    if (hasText(doc.intro)) {
      notes.push(`intro «${doc.intro}» kept, kicker «${props.kicker}» dropped`);
    } else {
      patch.intro = props.kicker.trim();
      patch.introPosition = 'above';
      if (hasI18n(props.kickerI18n)) patch['properties.introI18n'] = props.kickerI18n;
    }
  }
  for (const f of OLD_FIELDS) {
    if (f in props) patch[`properties.${f}`] = FieldValue.delete();
  }
  return { patch, notes };
}

async function main() {
  if (getApps().length === 0) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const snap = await db.collection('sections').get();
  let changed = 0;
  for (const d of snap.docs) {
    const result = kickerPatch(d.data());
    if (!result) continue;
    changed++;
    const shown = Object.fromEntries(Object.entries(result.patch).map(([k, v]) => [k, v instanceof FieldValue ? '<delete>' : v]));
    console.log(`${d.id} (${d.data().type}):`, JSON.stringify(shown), result.notes.length ? `— ${result.notes.join('; ')}` : '');
    if (APPLY) await d.ref.update(result.patch);
  }
  console.log(`${changed} of ${snap.size} sections ${APPLY ? 'migrated' : 'would be migrated (dry run; --apply to write)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
