/**
 * Migrates `workflow-rules` from one flat action to `steps[]` and adds the openChat step to the
 * two trip-report rules.
 *
 * Three things, all of which must happen BEFORE the functions deploy — a deployed engine reads
 * `steps` and a document without it does nothing at all:
 *   1. the `workflow_action` category gets the item `openChat`, or no admin can pick it — fatal
 *      if the category is missing, checked FIRST so a failure here touches no rule at all;
 *   2. every rule: the five flat fields become steps[0], the flat fields are deleted;
 *   3. the two trip rules get a second step that opens the chat with the responsible group — but
 *      only after confirming that group still exists and is not archived, since this script gets
 *      exactly one production run and a stale actionArg would only surface later, at trigger time.
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
import { argv, exit } from 'node:process';

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
  if (!d.action) {
    // an empty action on a live rule is a data problem, not something to paper over silently
    console.error(`  ✗ "${d.name}" has no 'action' — defaulting to 'openTask', but check this document`);
  }
  return {
    action: d.action ?? 'openTask',
    actionArg: d.actionArg ?? '',
    messageKey: d.messageKey ?? '',
    dueInDays: typeof d.dueInDays === 'number' ? d.dueInDays : 0,
    writeBack: d.writeBack ?? '',
  };
}

/** True if groups/<groupId> exists and is not archived — fail loudly, never trust a stale id. */
async function groupExists(groupId) {
  const snap = await db.collection('groups').doc(groupId).get();
  if (!snap.exists) {
    console.error(`  ✗ group '${groupId}' not found — chat step NOT added for this rule`);
    return false;
  }
  if (snap.data().isArchived) {
    console.error(`  ✗ group '${groupId}' is archived — chat step NOT added for this rule`);
    return false;
  }
  return true;
}

/**
 * Appends the openChat step for `d` if this rule's event/tenant matches a CHAT_STEPS entry and
 * the target group still exists — mutates `steps` in place. Returns 'added' | 'skipped' | 'n/a'
 * (n/a = this rule has no chat routing at all) for the summary printed by migrateRules().
 */
async function addChatStepIfDue(d, steps) {
  const chat = CHAT_STEPS.find((c) => c.event === d.event && (d.tenants ?? []).includes(c.tenant));
  if (!chat) return 'n/a';
  if (steps.some((s) => s.action === 'openChat' && s.actionArg === chat.groupId)) return 'added';
  if (!(await groupExists(chat.groupId))) return 'skipped';
  // no messageKey: the reporter's own text (params.notes) opens the conversation
  steps.push({ action: 'openChat', actionArg: chat.groupId, messageKey: '', dueInDays: 0, writeBack: '' });
  return 'added';
}

async function migrateRules() {
  const snap = await db.collection('workflow-rules').get();
  const withChat = [];
  const withoutChat = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const steps = Array.isArray(d.steps) && d.steps.length ? [...d.steps] : [stepFromFlat(d)];

    const chatResult = await addChatStepIfDue(d, steps);
    if (chatResult === 'added') withChat.push(d.name);
    if (chatResult === 'skipped') withoutChat.push(d.name);

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
  console.log(`  chat step added: ${withChat.length ? withChat.join(', ') : '(none)'}`);
  if (withoutChat.length) {
    console.error(`  chat step SKIPPED (group missing/archived): ${withoutChat.join(', ')}`);
  }
}

/**
 * The tenant's category definition, or the shared one it has not forked. Fatal if none is found —
 * without this item no admin can ever pick 'openChat' in the rule editor, and unlike a per-rule
 * chat step this isn't something we can skip and move on from; run this BEFORE migrateRules() so a
 * fatal exit here leaves every rule document untouched.
 */
async function addActionCategoryItem() {
  const snap = await db.collection('categories').where('name', '==', ACTION_CATEGORY).get();
  const docs = snap.docs.filter((d) => !d.data().isArchived);
  if (docs.length === 0) {
    console.error(`✗ category '${ACTION_CATEGORY}' not found (or only archived copies exist) — cannot add 'openChat', aborting before touching any rule`);
    exit(1);
  }
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
