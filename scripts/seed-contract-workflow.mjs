/**
 * Seeds the DB side of the contract deadline workflow (Vertragsverwaltung, spec 1.5 §6.3).
 *
 * The code side (the scanner in apps/functions/src/contract/contract-scan.ts that emits the
 * events) ships with the functions deploy. Three things live in Firestore:
 *   1. three `workflow_event` category items: contract.deadline, contract.renewed, contract.ended
 *      (the rule form's picker is fed from the DB category; their labels ship in the
 *      workflow-feature i18n bundles, the category has translateItems: true);
 *   2. three `i18nDefault` rows (module 'workflow') with the task texts, one per deadline kind;
 *   3. three `workflow-rules` documents for contract.deadline, one per kind. The engine does not
 *      translate params into labels, so each kind is its own rule, selected with
 *      probe 'paramIs' + probeArg 'kind=notice' | 'kind=end' | 'kind=rateFix'.
 *      Each rule opens a task for the contract's responsible person (responsibilityKey 'subject').
 *      The engine has no push action; the task is the notification.
 *
 * Run with:  node scripts/seed-contract-workflow.mjs                      (DRY RUN, writes nothing)
 *            node scripts/seed-contract-workflow.mjs --tenant scs         (still a dry run)
 *            node scripts/seed-contract-workflow.mjs --tenant scs --apply (writes)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: category items matched by `name`, i18n rows by (module, key), rules by `name` +
 * tenant. Re-running updates rather than duplicates; nothing is ever removed.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const APPLY = argv.includes('--apply');
const tenantArg = argv.indexOf('--tenant');
const TENANT = tenantArg >= 0 ? argv[tenantArg + 1] : 'scs';

const EVENT_CATEGORY = 'workflow_event';
const I18N_MODULE = 'workflow';
const SUBJECT = 'subject'; // reserved responsibilityKey: the event's personKey (the contract's responsible)

const EVENTS = [
  { name: 'contract.deadline', icon: 'calendar' },
  { name: 'contract.renewed', icon: 'sync' },
  { name: 'contract.ended', icon: 'document' },
];

const KINDS = [
  {
    kind: 'notice', ruleName: 'Vertragsfrist: Kündigung', i18nKey: 'contract.deadlineNotice',
    text: {
      de: '{contractName}: Letzter Kündigungstag am {deadline}. Ohne Kündigung verlängert sich der Vertrag.',
      en: '{contractName}: Last day to give notice is {deadline}. Without notice the contract renews.',
      fr: '{contractName} : dernier jour pour résilier le {deadline}. Sans résiliation, le contrat est reconduit.',
      es: '{contractName}: último día para cancelar el {deadline}. Sin cancelación, el contrato se renueva.',
      it: '{contractName}: ultimo giorno per la disdetta il {deadline}. Senza disdetta il contratto si rinnova.',
    },
  },
  {
    kind: 'end', ruleName: 'Vertragsfrist: Vertragsende', i18nKey: 'contract.deadlineEnd',
    text: {
      de: '{contractName}: Der Vertrag endet am {deadline}.',
      en: '{contractName}: The contract ends on {deadline}.',
      fr: '{contractName} : le contrat se termine le {deadline}.',
      es: '{contractName}: el contrato termina el {deadline}.',
      it: '{contractName}: il contratto termina il {deadline}.',
    },
  },
  {
    kind: 'rateFix', ruleName: 'Vertragsfrist: Zinsbindung', i18nKey: 'contract.deadlineRateFix',
    text: {
      de: '{contractName}: Die Zinsbindung endet am {deadline}. Bitte kümmere dich um die Anschlussfinanzierung.',
      en: '{contractName}: The fixed rate ends on {deadline}. Please take care of the follow-up financing.',
      fr: '{contractName} : le taux fixe se termine le {deadline}. Occupe-toi du financement de suite.',
      es: '{contractName}: la tasa fija termina el {deadline}. Ocúpate de la financiación posterior.',
      it: '{contractName}: il tasso fisso termina il {deadline}. Occupati del finanziamento successivo.',
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

async function upsertI18nDefault(key, text) {
  const snap = await db.collection('i18nDefault')
    .where('module', '==', I18N_MODULE).where('key', '==', key).limit(5).get();
  const existing = snap.docs.find((d) => !d.data().isArchived);
  const row = { module: I18N_MODULE, key, ...text, isHtml: false, isArchived: false };
  console.log(`  i18nDefault @${I18N_MODULE}.${key} = "${text.de}" ${existing ? '(update)' : '(create)'}`);
  if (!APPLY) return;
  if (existing) await existing.ref.set(row, { merge: true });
  else await db.collection('i18nDefault').add(row);
}

async function upsertRule(k) {
  const snap = await db.collection('workflow-rules').where('name', '==', k.ruleName).get();
  const existing = snap.docs.find((d) => (d.data().tenants ?? []).includes(TENANT));
  const rule = {
    tenants: [TENANT], isArchived: false,
    index: `n:${k.ruleName} e:contract.deadline r:${SUBJECT}`,
    tags: '', notes: 'Seeded by scripts/seed-contract-workflow.mjs',
    name: k.ruleName,
    event: 'contract.deadline',
    // probe 'paramIs' takes its 'name=value' argument from probeArg (no inline ':' value)
    probe: 'paramIs', probeArg: `kind=${k.kind}`,
    responsibilityKey: SUBJECT,
    // steps[], NOT the flat action/messageKey shape: the engine rejects a rule without steps.
    steps: [{
      action: 'openTask',
      actionArg: '',
      messageKey: `@${I18N_MODULE}.${k.i18nKey}`,
      dueInDays: 0,
      writeBack: '',
    }],
  };
  console.log(`  rule "${k.ruleName}" (paramIs ${rule.probeArg}) -> ${SUBJECT} ${existing ? '(update)' : '(create)'}`);
  if (!APPLY) return;
  if (existing) await existing.ref.set(rule, { merge: true });
  else await db.collection('workflow-rules').add(rule);
}

async function main() {
  console.log(`seed-contract-workflow: tenant '${TENANT}'${APPLY ? '' : ' (dry run)'}`);

  const category = await findCategory(EVENT_CATEGORY);
  if (!category) {
    console.error(`x category '${EVENT_CATEGORY}' not found for '${TENANT}' or 'system' - nothing seeded`);
    exit(1);
  }
  const items = category.data().items ?? [];
  let added = 0;
  for (const e of EVENTS) {
    if (items.some((i) => i.name === e.name)) {
      console.log(`  category item '${e.name}' already present`);
      continue;
    }
    items.push({ name: e.name, icon: e.icon, color: '', abbreviation: '' });
    added++;
    console.log(`  category item '${e.name}' (icon: ${e.icon}) ${APPLY ? 'added' : 'would be added'}`);
  }
  if (added > 0 && APPLY) await category.ref.update({ items });

  for (const k of KINDS) {
    await upsertI18nDefault(k.i18nKey, k.text);
    await upsertRule(k);
  }

  console.log(APPLY ? 'done (written)' : 'dry run - nothing written; re-run with --apply to write');
}

main().catch((error) => { console.error(error); exit(1); });
