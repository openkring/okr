/**
 * ONE-TIME MIGRATION — tiles sections drop their own Überzeile / Einleitung / Linktext.
 *
 * The lines around a tiles grid are the section's own fields now, and the link text lives on each tile:
 *   properties.kicker (+ kickerI18n)       → subTitle (+ properties.subTitleI18n)  — drawn above the title
 *                                            in the section colour; an existing subTitle is kept, the
 *                                            kicker is then reported and dropped
 *   properties.lead (+ leadI18n)           → intro (+ properties.introI18n)
 *   properties.linkLabel (+ linkLabelI18n) → items[].linkLabel (+ linkLabelI18n) of every tile with a url
 *                                            that has no link text of its own
 * The old fields are deleted. Run it right after the release that reads the new fields — before the
 * next website publish (Veröffentlichen / website:deploy), which would otherwise draw no Überzeile,
 * no Einleitung and no link text.
 *
 * Usage:
 *   node scripts/migrate-tiles-section-fields.mjs           # dry run (default)
 *   node scripts/migrate-tiles-section-fields.mjs --apply   # write
 * Requires: gcloud auth application-default login.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const OLD_FIELDS = ['kicker', 'kickerI18n', 'lead', 'leadI18n', 'linkLabel', 'linkLabelI18n'];

const hasText = (s) => typeof s === 'string' && s.trim().length > 0;
const hasI18n = (o) => !!o && typeof o === 'object' && Object.keys(o).length > 0;

/** The patch for one tiles section, or undefined when it carries none of the old fields. */
export function tilesPatch(doc) {
  const props = doc.properties ?? {};
  if (!OLD_FIELDS.some((f) => f in props)) return undefined;
  const patch = {};
  const notes = [];

  if (hasText(props.kicker)) {
    if (hasText(doc.subTitle)) {
      notes.push(`subTitle «${doc.subTitle}» kept, kicker «${props.kicker}» dropped`);
    } else {
      patch.subTitle = props.kicker;
      if (hasI18n(props.kickerI18n)) patch['properties.subTitleI18n'] = props.kickerI18n;
    }
  }
  if (hasText(props.lead)) {
    if (hasText(doc.intro)) notes.push(`intro «${doc.intro}» kept, lead «${props.lead}» dropped`);
    else {
      patch.intro = props.lead;
      if (hasI18n(props.leadI18n)) patch['properties.introI18n'] = props.leadI18n;
    }
  }
  if (hasText(props.linkLabel) && Array.isArray(props.items)) {
    patch['properties.items'] = props.items.map((item) =>
      hasText(item?.url) && !hasText(item?.linkLabel)
        ? { ...item, linkLabel: props.linkLabel, ...(hasI18n(props.linkLabelI18n) ? { linkLabelI18n: props.linkLabelI18n } : {}) }
        : item);
  }
  for (const f of OLD_FIELDS) if (f in props) patch[`properties.${f}`] = FieldValue.delete();
  return { patch, notes };
}

async function main() {
  if (getApps().length === 0) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const snap = await db.collection('sections').where('type', '==', 'tiles').get();
  let changed = 0;
  for (const d of snap.docs) {
    const result = tilesPatch(d.data());
    if (!result) { console.log(`= ${d.id}: nothing to migrate`); continue; }
    changed++;
    const shown = Object.fromEntries(Object.entries(result.patch).map(([k, v]) => [k, v instanceof FieldValue ? '<delete>' : v]));
    console.log(`${APPLY ? '✎' : '~'} ${d.id}:`, JSON.stringify(shown, null, 2));
    for (const n of result.notes) console.log(`  ! ${n}`);
    if (APPLY) await d.ref.update(result.patch);
  }
  console.log(`\n${snap.size} tiles sections, ${changed} ${APPLY ? 'migrated' : 'to migrate (dry run — pass --apply to write)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
