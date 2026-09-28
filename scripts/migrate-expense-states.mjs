/**
 * Expense states 2026-09-28: six code-owned statuses → four DB-owned ones.
 *
 *   1. seeds the `expense_state` category (categories collection, tenants ['system']) — the list,
 *      filter and edit modal read their labels/icons from it; the item NAMES are fixed because
 *      the Cloud Functions write them;
 *   2. migrates every expense document:
 *        posted                        → done
 *        validated + bookingKey        → processing   (booked, review still open)
 *        validated without bookingKey  → done         (the review task was completed)
 *        error                         → processing   (the failure stays in `ocrError`)
 *        pending-export                → processing
 *      and renames `category` → `accountKey` (FK → accounts). A non-empty free-text category is
 *      not an account key, so it is appended to `note` instead of being lost;
 *   3. renames the expense task names ("Neue Spese von …" → "Spesen von …") in `i18nDefault`.
 *
 * Deploy the functions FIRST: the old functions still write 'validated'/'posted'/'error'.
 *
 * Run with:  node scripts/migrate-expense-states.mjs --dry
 *            node scripts/migrate-expense-states.mjs
 *
 * Idempotent: a migrated document maps onto itself.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { argv } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const DRY = argv.includes('--dry');

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const STATE_CATEGORY = {
  name: 'expense_state',
  i18n: '@finance/expense/feature',
  translateItems: true,
  hasAbbreviation: false,
  tenants: ['system'],
  isArchived: false,
  index: 'n:expense_state',
  tags: '',
  notes: 'Item names are written by the Cloud Functions — do not rename them. Seeded by scripts/migrate-expense-states.mjs',
  items: [
    { name: 'draft',      icon: 'bulb',     color: '', abbreviation: '' },
    { name: 'processing', icon: 'cog',      color: '', abbreviation: '' },
    { name: 'done',       icon: 'checkbox', color: '', abbreviation: '' },
    { name: 'cancelled',  icon: 'cancel',   color: '', abbreviation: '' },
  ],
};

const TASK_NAMES = {
  'expense.created': {
    de: 'Spesen von {name} über {amount} {currency}',
    en: 'Expenses from {name} for {amount} {currency}',
    fr: 'Note de frais de {name} pour {amount} {currency}',
    es: 'Gastos de {name} por {amount} {currency}',
    it: 'Nota spese di {name} per {amount} {currency}',
  },
  'expense.validated': {
    de: 'Spesen von {name} über {amount} {currency} prüfen',
  },
};

export function nextStatus(status, bookingKey) {
  switch (status) {
    case 'posted':         return 'done';
    case 'validated':      return bookingKey ? 'processing' : 'done';
    case 'error':          return 'processing';
    case 'pending-export': return 'processing';
    default:               return status;
  }
}

async function seedCategory() {
  const snap = await db.collection('categories').where('name', '==', STATE_CATEGORY.name).get();
  const existing = snap.docs.find((d) => (d.data().tenants ?? []).includes('system'));
  console.log(`category ${STATE_CATEGORY.name} ${existing ? '(update)' : '(create)'}`);
  if (DRY) return;
  if (existing) await existing.ref.set(STATE_CATEGORY, { merge: true });
  else await db.collection('categories').add(STATE_CATEGORY);
}

async function migrateExpenses() {
  const snap = await db.collection('expenses').get();
  let changed = 0;
  for (const doc of snap.docs) {
    const e = doc.data();
    const patch = {};
    const status = nextStatus(e.status, e.bookingKey);
    if (status !== e.status) patch.status = status;
    if ('category' in e) {
      patch.category = FieldValue.delete();
      if (e.accountKey === undefined) patch.accountKey = '';
      const text = String(e.category ?? '').trim();
      if (text) patch.note = [e.note, `Kategorie: ${text}`].filter(Boolean).join('\n');
    }
    if (Object.keys(patch).length === 0) continue;
    changed++;
    console.log(`  expense ${doc.id}: ${e.status} → ${status}${'category' in e ? ', category → accountKey' : ''}`);
    if (!DRY) await doc.ref.update(patch);
  }
  console.log(`expenses: ${changed}/${snap.size} migrated`);
}

async function renameTaskNames() {
  for (const [key, text] of Object.entries(TASK_NAMES)) {
    const snap = await db.collection('i18nDefault')
      .where('module', '==', 'workflow').where('key', '==', key).get();
    const rows = snap.docs.filter((d) => !d.data().isArchived);
    for (const row of rows) console.log(`  i18nDefault @workflow.${key}: "${row.data().de}" → "${text.de}"`);
    if (rows.length === 0) console.log(`  i18nDefault @workflow.${key}: not found — run seed-expense-workflow-rules.mjs`);
    if (!DRY) for (const row of rows) await row.ref.set(text, { merge: true });
  }
}

console.log(`migrate-expense-states${DRY ? ' (dry run)' : ''}`);
await seedCategory();
await migrateExpenses();
await renameTaskNames();
