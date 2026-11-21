/**
 * Seeds one tenant's `household_type` category (spec 1.168 §4.2, §5.1): categories collection,
 * tenants [tenantId]. The list gives the tenant its own label for households (Familie, Paar, WG)
 * and carries the fee cap per type. Item NAMES are stored on HouseholdModel — do not rename them.
 *
 * Run with:
 *   node scripts/seed-household-type-category.mjs --tenant <id> [--item family|pair|wg] [--cap <CHF>] [--all-fees] [--dry]
 *
 * Idempotent: an existing per-tenant list is merged — only the named item is added or updated,
 * other items stay untouched. Never duplicated.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const CATEGORY_NAME = 'household_type';
const ITEMS = {
  family: { name: 'family', icon: 'people', color: '', abbreviation: 'F' },
  pair: { name: 'pair', icon: 'people', color: '', abbreviation: 'P' },
  wg: { name: 'wg', icon: 'people', color: '', abbreviation: 'W' },
};

const USAGE = `Usage: node scripts/seed-household-type-category.mjs --tenant <id> [--item family|pair|wg] [--cap <CHF>] [--all-fees] [--dry]

  --tenant <id>   tenant whose household_type list is seeded (required)
  --item <name>   item to add/update: family (default), pair or wg
  --cap <CHF>     fee cap for the item in CHF (number > 0); also sets feeCapOnlyMembershipFee: true
  --all-fees      with --cap: cap the whole invoice total (feeCapOnlyMembershipFee: false)
  --dry           print what would be written, write nothing
  --help          this text`;

function arg(name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}
function fail(msg) {
  console.error(`error: ${msg}\n\n${USAGE}`);
  exit(1);
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  exit(0);
}

const DRY = argv.includes('--dry');
const tenantId = arg('--tenant');
if (!tenantId || tenantId.startsWith('--')) fail('--tenant <id> is required');
const itemName = arg('--item') ?? 'family';
if (!ITEMS[itemName]) fail(`--item must be one of ${Object.keys(ITEMS).join(', ')}`);

const item = { ...ITEMS[itemName] };
const capRaw = arg('--cap');
if (capRaw !== undefined) {
  const cap = Number(capRaw);
  if (!Number.isFinite(cap) || cap <= 0) fail('--cap must be a number greater than 0');
  item.feeCap = cap;
  item.feeCapOnlyMembershipFee = !argv.includes('--all-fees');
} else if (argv.includes('--all-fees')) {
  fail('--all-fees only makes sense together with --cap');
}

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const newCategory = () => ({
  name: CATEGORY_NAME,
  i18n: '@relationship/household/feature',
  translateItems: true,
  hasAbbreviation: true,
  tenants: [tenantId],
  isArchived: false,
  index: `n:${CATEGORY_NAME}`,
  tags: '',
  notes: 'Item names are stored on HouseholdModel — do not rename them. Seeded by scripts/seed-household-type-category.mjs',
  items: [item],
});

async function seedCategory() {
  const snap = await db.collection('categories').where('name', '==', CATEGORY_NAME).where('tenants', 'array-contains', tenantId).get();
  const existing = snap.docs[0];
  console.log(`category ${CATEGORY_NAME} for tenant ${tenantId} ${existing ? '(update)' : '(create)'}`);
  if (existing) {
    const items = [...(existing.data().items ?? [])];
    const idx = items.findIndex((i) => i.name === item.name);
    if (idx === -1) items.push(item);
    else items[idx] = { ...items[idx], ...item };
    console.log(JSON.stringify({ items }, null, 2));
    if (!DRY) await existing.ref.set({ items }, { merge: true });
  } else {
    const doc = newCategory();
    console.log(JSON.stringify(doc, null, 2));
    if (!DRY) await db.collection('categories').add(doc);
  }
}

console.log(`seed-household-type-category${DRY ? ' (dry run)' : ''}`);
await seedCategory();
