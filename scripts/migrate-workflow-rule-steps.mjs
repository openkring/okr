/**
 * Migrates `workflow-rules` from one flat action to `steps[]` and adds the openChat step to the
 * two trip-report rules.
 *
 * Three things, all of which must happen BEFORE the functions deploy — a deployed engine reads
 * `steps` and a document without it does nothing at all:
 *   1. every rule: the five flat fields become steps[0], the flat fields are deleted;
 *   2. the `workflow_action` category gets the item `openChat`, or no admin can pick it;
 *   3. the two trip rules get a second step that opens the chat with the responsible group.
 *
 * Run with:  node scripts/migrate-workflow-rule-steps.mjs --dry
 *            node scripts/migrate-workflow-rule-steps.mjs
 *
 * Idempotent: a rule that already has a non-empty `steps` keeps it, and the openChat step is
 * matched by action + actionArg, so a re-run neither duplicates nor overwrites.
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS)
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { argv } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const DRY = argv.includes('--dry');
const ACTION_CATEGORY = 'workflow_action';

/** event → the group that answers in chat. One entry per tenant-specific routing decision. */
const CHAT_STEPS = [
  { event: 'trip.damageReported', tenant: 'scs', groupId: 'Ausschuss Boote' },
  { event: 'trip.bugReported',    tenant: 'scs', groupId: 'support' },
];

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

function stepFromFlat(d) {
  return {
    action: d.action || 'openTask',
    actionArg: d.actionArg ?? '',
    messageKey: d.messageKey ?? '',
    dueInDays: typeof d.dueInDays === 'number' ? d.dueInDays : 0,
    writeBack: d.writeBack ?? '',
  };
}

async function migrateRules() {
  const snap = await db.collection('workflow-rules').get();
  for (const doc of snap.docs) {
    const d = doc.data();
    const steps = Array.isArray(d.steps) && d.steps.length ? [...d.steps] : [stepFromFlat(d)];

    const chat = CHAT_STEPS.find((c) => c.event === d.event && (d.tenants ?? []).includes(c.tenant));
    if (chat && !steps.some((s) => s.action === 'openChat' && s.actionArg === chat.groupId)) {
      // no messageKey: the reporter's own text (params.notes) opens the conversation
      steps.push({ action: 'openChat', actionArg: chat.groupId, messageKey: '', dueInDays: 0, writeBack: '' });
    }

    console.log(`  ${d.name}: ${steps.map((s) => s.action).join(' + ')}`);
    if (DRY) continue;
    await doc.ref.update({
      steps,
      action: FieldValue.delete(),
      actionArg: FieldValue.delete(),
      messageKey: FieldValue.delete(),
      dueInDays: FieldValue.delete(),
      writeBack: FieldValue.delete(),
    });
  }
  console.log(`${snap.size} rules migrated${DRY ? ' (dry run)' : ''}`);
}

/** The tenant's category definition, or the shared one it has not forked. */
async function addActionCategoryItem() {
  const snap = await db.collection('categories').where('name', '==', ACTION_CATEGORY).get();
  const docs = snap.docs.filter((d) => !d.data().isArchived);
  for (const doc of docs) {
    const items = doc.data().items ?? [];
    if (items.some((i) => i.name === 'openChat')) {
      console.log(`  category ${doc.id}: 'openChat' already present`);
      continue;
    }
    items.push({ name: 'openChat', icon: 'chat', color: '', abbreviation: '' });
    console.log(`  category ${doc.id}: 'openChat' added`);
    if (!DRY) await doc.ref.update({ items });
  }
}

await addActionCategoryItem();
await migrateRules();
