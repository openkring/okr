/**
 * Seeds the DB side of the expense workflow (spec 2026-09-02-expense-workflow-design.md §3.3).
 *
 * The code side (the four emits) ships with the functions deploy. Three things live in Firestore:
 *   1. four `workflow_event` category items — the rule form's picker is fed from the DB category;
 *   2. four `i18nDefault` rows for the task names;
 *   3. four `workflow-rules` documents replacing the createReviewTask calls in ocr/index.ts.
 *
 * Run with:  node scripts/seed-expense-workflow-rules.mjs --dry
 *            node scripts/seed-expense-workflow-rules.mjs --tenant scs
 *
 * Idempotent: category items matched by `name`, i18n rows by (module, key), rules by `name` +
 * tenant. Re-running updates rather than duplicates.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const DRY = argv.includes('--dry');
const tenantArg = argv.indexOf('--tenant');
const TENANT = tenantArg >= 0 ? argv[tenantArg + 1] : 'scs';

const EVENT_CATEGORY = 'workflow_event';
const I18N_MODULE = 'workflow';
const RESPONSIBILITY_NAME = 'Kassier';

const TRIGGERS = [
  {
    event: 'expense.created', icon: 'expense', dueInDays: 7,
    ruleName: 'Spese eingereicht → Kassier', i18nKey: 'expense.created',
    text: {
      de: 'Neue Spese von {name} über {amount} {currency}',
      en: 'New expense from {name} for {amount} {currency}',
      fr: 'Nouvelle note de frais de {name} pour {amount} {currency}',
      es: 'Nuevo gasto de {name} por {amount} {currency}',
      it: 'Nuova nota spese di {name} per {amount} {currency}',
    },
  },
  {
    event: 'expense.ocrFailed', icon: 'warning', dueInDays: 3,
    ruleName: 'Spese OCR fehlgeschlagen → Kassier', i18nKey: 'expense.ocrFailed',
    text: {
      de: 'Beleg von {name} konnte nicht gelesen werden — bitte manuell erfassen',
      en: 'Receipt from {name} could not be read — please capture it manually',
      fr: 'Le justificatif de {name} n’a pas pu être lu — à saisir manuellement',
      es: 'No se pudo leer el comprobante de {name} — regístralo manualmente',
      it: 'La ricevuta di {name} non è stata letta — inseriscila manualmente',
    },
  },
  {
    event: 'expense.validated', icon: 'checkbox', dueInDays: 7,
    ruleName: 'Spese verbucht → Kassier prüft', i18nKey: 'expense.validated',
    text: {
      de: 'Spese von {name} über {amount} {currency} prüfen',
      en: 'Review expense from {name} for {amount} {currency}',
      fr: 'Vérifier la note de frais de {name} pour {amount} {currency}',
      es: 'Revisar el gasto de {name} por {amount} {currency}',
      it: 'Verificare la nota spese di {name} per {amount} {currency}',
    },
  },
  {
    event: 'expense.pendingExport', icon: 'download', dueInDays: 7,
    ruleName: 'Spese für externe Buchhaltung → Kassier', i18nKey: 'expense.pendingExport',
    text: {
      de: 'Spese von {name} über {amount} {currency} extern verbuchen',
      en: 'Post expense from {name} for {amount} {currency} in the external ledger',
      fr: 'Comptabiliser la note de frais de {name} pour {amount} {currency} en externe',
      es: 'Contabilizar externamente el gasto de {name} por {amount} {currency}',
      it: 'Contabilizzare esternamente la nota spese di {name} per {amount} {currency}',
    },
  },
];

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

async function findCategory(name) {
  const snap = await db.collection('categories').where('name', '==', name).get();
  const docs = snap.docs.filter((d) => !d.data().isArchived);
  return docs.find((d) => (d.data().tenants ?? []).includes(TENANT))
    ?? docs.find((d) => (d.data().tenants ?? []).includes('system'));
}

async function findResponsibility(name) {
  const snap = await db.collection('responsibilities').where('name', '==', name).get();
  return snap.docs.find((d) => !d.data().isArchived && (d.data().tenants ?? []).includes(TENANT));
}

async function upsertI18nDefault(key, text) {
  const snap = await db.collection('i18nDefault')
    .where('module', '==', I18N_MODULE).where('key', '==', key).limit(5).get();
  const existing = snap.docs.find((d) => !d.data().isArchived);
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
    tenants: [TENANT], isArchived: false,
    index: `n:${trigger.ruleName} e:${trigger.event} r:${responsibilityKey}`,
    tags: '', notes: 'Seeded by scripts/seed-expense-workflow-rules.mjs',
    name: trigger.ruleName,
    event: trigger.event,
    probe: '', probeArg: '',
    responsibilityKey,
    // steps[], NOT the flat action/messageKey shape — engine.ts:245 rejects a rule without steps.
    steps: [{
      action: 'openTask',
      actionArg: '',
      messageKey: `@${I18N_MODULE}.${trigger.i18nKey}`,
      dueInDays: trigger.dueInDays,
      writeBack: '',
    }],
  };
  console.log(`  rule "${trigger.ruleName}" → ${responsibilityKey} ${existing ? '(update)' : '(create)'}`);
  if (DRY) return;
  if (existing) await existing.ref.set(rule, { merge: true });
  else await db.collection('workflow-rules').add(rule);
}

async function main() {
  console.log(`seed-expense-workflow-rules: tenant '${TENANT}'${DRY ? ' (dry run)' : ''}`);

  const category = await findCategory(EVENT_CATEGORY);
  if (!category) {
    console.error(`✗ category '${EVENT_CATEGORY}' not found — create it before seeding the rules`);
    exit(1);
  }
  const items = category.data().items ?? [];
  let added = 0;
  for (const t of TRIGGERS) {
    if (items.some((i) => i.name === t.event)) {
      console.log(`  category item '${t.event}' already present`);
      continue;
    }
    items.push({ name: t.event, icon: t.icon, color: '', abbreviation: '' });
    added++;
    console.log(`  category item '${t.event}' added`);
  }
  if (added > 0 && !DRY) await category.ref.update({ items });

  const responsibility = await findResponsibility(RESPONSIBILITY_NAME);
  if (!responsibility) {
    // Fail loudly: the engine would fall back to groups/<key>.admins[0] and then the tenant
    // admin, which is the silent misrouting this migration exists to remove.
    console.error(`✗ responsibility '${RESPONSIBILITY_NAME}' not found for tenant '${TENANT}' — no rules seeded`);
    exit(1);
  }

  for (const t of TRIGGERS) {
    await upsertI18nDefault(t.i18nKey, t.text);
    await upsertRule(t, responsibility.id);
  }

  console.log(DRY ? 'dry run — nothing written' : 'done');
}

main().catch((error) => { console.error(error); exit(1); });
