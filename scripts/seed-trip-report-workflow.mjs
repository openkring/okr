/**
 * Seeds the DB side of the Schaden-/Fehlermeldung workflow triggers.
 *
 * The code side (the `reportIncident` callable and the two events it emits) ships with the
 * functions deploy. Three things live in Firestore and cannot ship with it:
 *
 *   1. the two new `workflow_event` category items — the picker in the rule form is fed from
 *      the DB category, so without them an admin cannot select the events;
 *   2. two `i18nDefault` rows for the task names the rules produce (an override per tenant
 *      still wins at runtime — see the i18n skill);
 *   3. the two `workflow-rules` documents that reproduce what the client used to hard-code:
 *      a damage goes to 'Ressort Boote', a bug to the Logbuch responsibility.
 *
 * Run with:  node scripts/seed-trip-report-workflow.mjs --dry          (inspect first)
 *            node scripts/seed-trip-report-workflow.mjs [--tenant scs]
 *            node scripts/seed-trip-report-workflow.mjs --i18n-only     (task names only)
 *
 * `--i18n-only` writes step 2 and skips the rules. Use it to change the wording of the task
 * names once the rules exist: an operator may have RENAMED a rule in the CMS (there is a live
 * 'Fehlermeldung → Logbuch Dev'), and `upsertRule` matches by name + tenant — so a plain re-run
 * would not update that rule, it would ADD a second one and every report would open two tasks.
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: the category items are matched by `name`, the i18n rows by (module, key) and the
 * rules by `name` + tenant, so a re-run updates rather than duplicates. The responsibilities are
 * looked up BY NAME once, here — the rule then stores the okey, which is what makes the runtime
 * path (validity window, delegate, group fallback) work at all.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const DRY = argv.includes('--dry');
const I18N_ONLY = argv.includes('--i18n-only');
const tenantArg = argv.indexOf('--tenant');
const TENANT = tenantArg >= 0 ? argv[tenantArg + 1] : 'scs';

const EVENT_CATEGORY = 'workflow_event';
const I18N_MODULE = 'workflow';

/** The two new events, their category item and the rule that used to be hard-coded in TripStore. */
const TRIGGERS = [
  {
    event: 'trip.damageReported',
    icon: 'warning',
    ruleName: 'Schadenmeldung → Ressort Boote',
    responsibilityName: 'Ressort Boote',
    i18nKey: 'trip.damageReported',
    // The task NAME says which trip; the reporter and the boat are in the notes the callable
    // composes (see apps/functions/src/trip/report.ts), so they are not repeated here.
    text: {
      de: 'Logbuch meldet Schaden auf Fahrt {tripName}',
      en: 'Logbook reports damage on trip {tripName}',
      fr: 'Le carnet de bord signale un dommage lors de la sortie {tripName}',
      es: 'El cuaderno de bitácora informa de un daño en la salida {tripName}',
      it: 'Il giornale di bordo segnala un danno durante l’uscita {tripName}',
    },
  },
  {
    event: 'trip.bugReported',
    icon: 'bug',
    ruleName: 'Fehlermeldung → Logbuch',
    responsibilityName: 'Logbuch2',
    i18nKey: 'trip.bugReported',
    text: {
      de: 'Logbuch meldet Fehler auf Fahrt {tripName}',
      en: 'Logbook reports a bug on trip {tripName}',
      fr: 'Le carnet de bord signale une erreur lors de la sortie {tripName}',
      es: 'El cuaderno de bitácora informa de un error en la salida {tripName}',
      it: 'Il giornale di bordo segnala un errore durante l’uscita {tripName}',
    },
  },
];

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

/** The tenant's category definition, or the shared one it has not forked. */
async function findCategory(name) {
  const snap = await db.collection('categories').where('name', '==', name).get();
  const docs = snap.docs.filter((d) => !d.data().isArchived);
  return docs.find((d) => (d.data().tenants ?? []).includes(TENANT))
    ?? docs.find((d) => (d.data().tenants ?? []).includes('default'));
}

async function findResponsibility(name) {
  const snap = await db.collection('responsibilities').where('name', '==', name).get();
  return snap.docs.find((d) => !d.data().isArchived && (d.data().tenants ?? []).includes(TENANT));
}

async function upsertI18nDefault(key, text) {
  const snap = await db.collection('i18nDefault')
    .where('module', '==', I18N_MODULE).where('key', '==', key).limit(5).get();
  const existing = snap.docs.find((d) => !d.data().isArchived);
  // all five supported languages, per the i18n skill — a missing one renders the raw key,
  // Transloco does not fall back to `de`
  const row = { module: I18N_MODULE, key, ...text, isHtml: false, isArchived: false };
  console.log(`  i18nDefault @${I18N_MODULE}.${key} = "${text.de}" ${existing ? '(update)' : '(create)'}`);
  if (DRY) return;
  if (existing) await existing.ref.set(row, { merge: true });
  else await db.collection('i18nDefault').add(row);
}

async function upsertRule(trigger, responsibilityKey) {
  const snap = await db.collection('workflow-rules').where('name', '==', trigger.ruleName).get();
  const existing = snap.docs.find((d) => (d.data().tenants ?? []).includes(TENANT));
  const rule = {
    tenants: [TENANT], isArchived: false, index: `n:${trigger.ruleName} e:${trigger.event} r:${responsibilityKey}`,
    tags: '', notes: 'Seeded by scripts/seed-trip-report-workflow.mjs',
    name: trigger.ruleName,
    event: trigger.event,
    probe: '', probeArg: '',
    action: 'openTask', actionArg: '', writeBack: '',
    responsibilityKey,
    messageKey: `@${I18N_MODULE}.${trigger.i18nKey}`,
    dueInDays: 0,
  };
  console.log(`  rule "${trigger.ruleName}" → ${responsibilityKey} ${existing ? '(update)' : '(create)'}`);
  if (DRY) return;
  if (existing) await existing.ref.set(rule, { merge: true });
  else await db.collection('workflow-rules').add(rule);
}

async function main() {
  console.log(`seed-trip-report-workflow: tenant '${TENANT}'${DRY ? ' (dry run)' : ''}`);

  const category = I18N_ONLY ? undefined : await findCategory(EVENT_CATEGORY);
  if (!I18N_ONLY && !category) {
    console.error(`✗ category '${EVENT_CATEGORY}' not found — create it before seeding the rules`);
    exit(1);
  }
  const items = category ? (category.data().items ?? []) : [];
  let added = 0;
  for (const t of I18N_ONLY ? [] : TRIGGERS) {
    if (items.some((i) => i.name === t.event)) {
      console.log(`  category item '${t.event}' already present`);
      continue;
    }
    items.push({ name: t.event, icon: t.icon, color: '', abbreviation: '' });
    added++;
    console.log(`  category item '${t.event}' added`);
  }
  if (added > 0 && !DRY) await category.ref.update({ items });

  for (const t of TRIGGERS) {
    await upsertI18nDefault(t.i18nKey, t.text);
    if (I18N_ONLY) continue;
    const responsibility = await findResponsibility(t.responsibilityName);
    if (!responsibility) {
      // fail loudly: a rule without a responsibilityKey resolves to the tenant admin at runtime,
      // which is exactly the silent misrouting this migration set out to remove
      console.error(`✗ responsibility '${t.responsibilityName}' not found for tenant '${TENANT}' — rule '${t.ruleName}' NOT seeded`);
      continue;
    }
    await upsertRule(t, responsibility.id);
  }

  console.log(DRY ? 'dry run — nothing written' : 'done');
}

main().catch((error) => { console.error(error); exit(1); });
