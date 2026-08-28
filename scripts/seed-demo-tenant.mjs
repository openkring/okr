/**
 * WRITES demo data to tenant `okr` ONLY — invented persons/orgs/records, never copied
 * from a real tenant, so that the `okr` dashboard has enough rows to reproduce the
 * performance problem (many concurrent Firestore listeners) that `okr`'s near-empty
 * data cannot reproduce today.
 *
 * Safety rails (non-negotiable, see task-B2-brief.md):
 *  1. Tenant lock — refuses to run unless the first argument is exactly `okr`.
 *  2. Invented names only — never reads/copies a document from another tenant (e.g. `scs`).
 *  3. Every written document carries `seedBatch: 'perf-demo-2026-08-28'` so the sibling
 *     teardown script (scripts/teardown-demo-tenant.mjs) can remove exactly these docs,
 *     by marker, never by tenant (okr already has real shared content: pages, sections,
 *     menuItems, categories — a tenant-scoped delete would destroy it).
 *  4. `--dry-run` prints intended counts without writing anything.
 *
 * Usage:
 *   node scripts/seed-demo-tenant.mjs okr --dry-run
 *   node scripts/seed-demo-tenant.mjs okr
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TENANT = process.argv[2];
if (TENANT !== 'okr') {
  console.error(`Refusing to operate on tenant "${TENANT}". These scripts only ever touch tenant "okr".`);
  process.exit(1);
}
const DRY_RUN = process.argv.includes('--dry-run');
const SEED_BATCH = 'perf-demo-2026-08-28';

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

// --avatars-only: targeted re-seed of just the `avatars` collection against persons that were
// ALREADY seeded in an earlier full run (used once, 2026-08-28, to fix avatars that had been
// written with auto-generated ids instead of the required `person.<personKey>` id — see
// getAvatarKey in libs/shared/util-core/src/lib/icon.util.ts and the read path in
// libs/shared/ui/src/lib/avatar-user.ts). Queries the real, already-committed person ids rather
// than generating fresh ones, since a bare re-run of the full script would create a second,
// disjoint batch of persons instead of reusing the ones already in Firestore.
if (process.argv.includes('--avatars-only')) {
  const existingPersons = await db.collection('persons')
    .where('tenants', 'array-contains', 'okr')
    .where('seedBatch', '==', SEED_BATCH)
    .limit(100)
    .get();
  const entries = existingPersons.docs.map((doc, i) => ({
    id: `person.${doc.id}`,
    data: {
      storagePath: `avatars/demo-${i}.jpg`,
      isArchived: false,
      tenants: ['okr'],
      seedBatch: SEED_BATCH,
    },
  }));
  const prepared = prepareWithIds('avatars', entries);
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Re-seeding avatars only, for ${prepared.length} already-seeded persons`);
  await writeAll('avatars', prepared);
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Done. Total documents: ${prepared.length}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Invented name material (deterministic, index-based combination — no Math.random()).
// ---------------------------------------------------------------------------
const FIRST = ['Anna','Beat','Claudia','Daniel','Eva','Felix','Gabriela','Hans','Irene','Jonas',
               'Karin','Lukas','Marina','Niklaus','Olivia','Peter','Rahel','Simon','Tanja','Urs'];
const LAST  = ['Ammann','Brunner','Christen','Diggelmann','Egger','Frei','Graf','Huber','Iten',
               'Jost','Keller','Lehmann','Meier','Naef','Odermatt','Pfister','Roth','Suter',
               'Tanner','Vogel'];
const ORG_WORDS = ['Verein', 'Klub', 'Genossenschaft', 'Stiftung', 'Gruppe', 'Gesellschaft',
                    'Initiative', 'Netzwerk', 'Forum', 'Runde'];
const ORG_THEMES = ['Seeblick', 'Bergpfad', 'Talwind', 'Sonnenhof', 'Rebberg', 'Waldrand',
                     'Flussufer', 'Ackerland', 'Turmblick', 'Gartenweg', 'Dorfplatz', 'Wiesengrund',
                     'Hügelweg', 'Quellgrund', 'Lindenhof', 'Brunnenmatt', 'Steinbach', 'Buchenwald',
                     'Kornfeld', 'Rosenweg'];
const GROUP_NAMES = ['Vorstand', 'Jugendriege', 'Aktivmitglieder', 'Senioren', 'Kommission Technik',
                      'Kommission Anlässe', 'Trainingsgruppe A', 'Trainingsgruppe B', 'Freiwillige',
                      'Materialwart-Team'];
const RESOURCE_NAMES = ['Ruderboot 1', 'Ruderboot 2', 'Ruderboot 3', 'Ruderboot 4', 'Ruderboot 5',
                         'Ruderboot 6', 'Motorboot 1', 'Trailer 1', 'Trailer 2', 'Kajak 1', 'Kajak 2',
                         'Kajak 3', 'Rettungsweste-Set A', 'Rettungsweste-Set B', 'Steg-Container',
                         'Werkzeugkiste 1', 'Werkzeugkiste 2', 'Zelt 1', 'Zelt 2', 'Anhänger'];
const TASK_TITLES = ['Steg kontrollieren', 'Material inventarisieren', 'Anlass planen',
                      'Rechnung prüfen', 'Boot reinigen', 'Newsletter schreiben', 'Protokoll verfassen',
                      'Sponsoring anfragen', 'Website aktualisieren', 'Trainingsplan erstellen'];
const EVENT_TITLES = ['Vereinsversammlung', 'Sommerfest', 'Trainingslager', 'Regatta', 'Grillabend',
                       'Materialrevision', 'Vorstandssitzung', 'Jugendtag', 'Herbstausflug', 'Sitzung Kommission'];
const CALEVENT_TYPES = ['training', 'meeting', 'social', 'competition'];
const COMMENT_TEXTS = ['Erledigt bis Freitag.', 'Bitte um Rückmeldung.', 'Danke für die Info.',
                        'Termin passt mir.', 'Ich kümmere mich darum.', 'Können wir das verschieben?',
                        'Alles bereit.', 'Noch offen, siehe unten.'];

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; }
function fmtDateTime(d) { return `${fmtDate(d)}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; }
function addDays(base, days) { const d = new Date(base); d.setDate(d.getDate() + days); return d; }

const TODAY = new Date('2026-08-28T09:00:00');

function demoPersons(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const firstName = FIRST[i % FIRST.length];
    const lastName = LAST[Math.floor(i / FIRST.length) % LAST.length];
    out.push({
      firstName,
      lastName,
      name: `${lastName} ${firstName}`,
      gender: i % 3 === 0 ? 'female' : 'male',
      index: `n:${lastName} ${firstName}`.toLowerCase(),
      isArchived: false,
      isDeceased: false,
      deathYear: '',
      favZipCode: '8712',
      bexioId: '',
      usageImages: 0,
      usageDateOfBirth: 1,
      usagePostalAddress: 1,
      usageEmail: 1,
      usagePhone: 1,
      usageName: 1,
      tenants: ['okr'],
      seedBatch: SEED_BATCH,
      notes: '',
      tags: '',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Batched writer — Firestore batch limit is 500, we use 400 for headroom.
// Refs are created up front (doc() generates the id client-side) so downstream
// collections can reference the ids of documents that have not been committed yet.
// ---------------------------------------------------------------------------
function prepare(collectionName, dataArray) {
  return dataArray.map((data) => ({ ref: db.collection(collectionName).doc(), data }));
}

// Like prepare(), but with an explicit doc id per entry instead of an auto-generated one.
// Needed for avatars: the app reads an avatar by getAvatarKey(modelType, key) =
// `${modelType}.${key}` (libs/shared/util-core/src/lib/icon.util.ts), e.g. `person.<personKey>`
// — an auto-generated id would never be found by that read path.
function prepareWithIds(collectionName, entries) {
  return entries.map(({ id, data }) => ({ ref: db.collection(collectionName).doc(id), data }));
}

async function writeAll(collectionName, prepared) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${collectionName}: would write ${prepared.length} documents`);
    return;
  }
  for (let i = 0; i < prepared.length; i += 400) {
    const batch = db.batch();
    for (const { ref, data } of prepared.slice(i, i + 400)) {
      batch.set(ref, data);
    }
    await batch.commit();
    console.log(`${collectionName}: ${Math.min(i + 400, prepared.length)}/${prepared.length}`);
  }
}

function avatarInfo(personPrep, i) {
  const p = personPrep[i % personPrep.length];
  return {
    key: p.ref.id,
    name1: p.data.firstName,
    name2: p.data.lastName,
    modelType: 'person',
    type: '',
    subType: '',
    label: `${p.data.firstName} ${p.data.lastName}`,
  };
}

// ---------------------------------------------------------------------------
// Build all collections
// ---------------------------------------------------------------------------

// persons (600)
const personsData = demoPersons(600);
const personsPrep = prepare('persons', personsData);

// addresses (600) — one favorite email address per person
const addressesData = personsPrep.map((p, i) => ({
  addressChannel: 'email',
  addressChannelLabel: '',
  addressUsage: 'home',
  addressUsageLabel: '',
  email: `${p.data.firstName}.${p.data.lastName}.demo${i}@example-okr.invalid`.toLowerCase(),
  phone: '',
  iban: '',
  ssn: '',
  dob: '',
  dod: '',
  streetName: 'Musterweg',
  streetNumber: String((i % 40) + 1),
  addressValue2: '',
  zipCode: '8712',
  city: 'Stäfa',
  countryCode: 'CH',
  url: '',
  isFavorite: true,
  isCc: false,
  isValidated: true,
  isArchived: false,
  tags: '',
  notes: '',
  tenants: ['okr'],
  index: `a:${p.data.lastName} ${p.data.firstName}`.toLowerCase(),
  parentKey: `person.${p.ref.id}`,
  seedBatch: SEED_BATCH,
}));
const addressesPrep = prepare('addresses', addressesData);

// avatars (100) — not every person has one. Doc id MUST be `person.<personKey>`
// (getAvatarKey(modelType, key) => `${modelType}.${key}`, libs/shared/util-core/src/lib/icon.util.ts;
// read path: readModel<AvatarModel>(AvatarCollection, `${PersonModelName}.${personKey}`) in
// libs/shared/ui/src/lib/avatar-user.ts) — an auto-generated id would never be found.
const avatarsEntries = personsPrep.slice(0, 100).map((p, i) => ({
  id: `person.${p.ref.id}`,
  data: {
    storagePath: `avatars/demo-${i}.jpg`,
    isArchived: false,
    tenants: ['okr'],
    seedBatch: SEED_BATCH,
  },
}));
const avatarsPrep = prepareWithIds('avatars', avatarsEntries);

// orgs (20)
const orgsData = Array.from({ length: 20 }, (_, i) => ({
  name: `${ORG_WORDS[i % ORG_WORDS.length]} ${ORG_THEMES[i % ORG_THEMES.length]}`,
  type: 'association',
  dateOfFoundation: '19900101',
  dateOfLiquidation: '',
  taxId: '',
  notes: '',
  tags: '',
  bexioId: '',
  membershipCategoryKey: 'mcat',
  tenants: ['okr'],
  isArchived: false,
  index: `o:${ORG_WORDS[i % ORG_WORDS.length]} ${ORG_THEMES[i % ORG_THEMES.length]}`.toLowerCase(),
  favZipCode: '8712',
  seedBatch: SEED_BATCH,
}));
const orgsPrep = prepare('orgs', orgsData);

// groups (10) — each hangs off an org
const groupsData = Array.from({ length: 10 }, (_, i) => {
  const org = orgsPrep[i % orgsPrep.length];
  const admin = avatarInfo(personsPrep, i);
  return {
    name: GROUP_NAMES[i % GROUP_NAMES.length],
    notes: '',
    tags: '',
    icon: 'group',
    hasContent: true,
    hasChat: true,
    hasCalendar: true,
    hasTasks: true,
    hasFiles: true,
    filesFolder: '',
    hasMembers: true,
    matrixRoomId: '',
    admins: [admin],
    parentKey: org.ref.id,
    parentName: org.data.name,
    parentModelType: 'org',
    visibility: '',
    notifyType: 'memberOnly',
    chatMode: 'shared',
    postPolicy: 'all',
    tenants: ['okr'],
    isArchived: false,
    index: `g:${GROUP_NAMES[i % GROUP_NAMES.length]}`.toLowerCase(),
    seedBatch: SEED_BATCH,
  };
});
const groupsPrep = prepare('groups', groupsData);

// memberships (300) — first 300 persons, alternating org/group membership
const membershipsData = Array.from({ length: 300 }, (_, i) => {
  const person = personsPrep[i];
  const useGroup = i % 3 === 0;
  const target = useGroup ? groupsPrep[i % groupsPrep.length] : orgsPrep[i % orgsPrep.length];
  return {
    index: `m:${person.data.lastName} ${person.data.firstName}`.toLowerCase(),
    tags: '',
    notes: '',
    memberKey: person.ref.id,
    memberName1: person.data.firstName,
    memberName2: person.data.lastName,
    memberModelType: 'person',
    memberType: person.data.gender,
    memberNickName: '',
    memberAbbreviation: '',
    memberBirthYear: '',
    memberIsDeceased: false,
    memberDeathYear: '',
    memberZipCode: '8712',
    memberBexioId: '',
    memberId: '',
    orgKey: target.ref.id,
    orgName: target.data.name,
    orgModelType: useGroup ? 'group' : 'org',
    dateOfEntry: '20200101',
    dateOfExit: '',
    category: 'active',
    state: 'active',
    orgFunction: '',
    order: 1,
    relLog: '',
    relIsLast: true,
    rebate: 0,
    rebateReason: 'none',
    tenants: ['okr'],
    isArchived: false,
    seedBatch: SEED_BATCH,
  };
});
const membershipsPrep = prepare('memberships', membershipsData);

// tasks (40) — dashboard section d-tasks, mostly open so they render
const tasksData = Array.from({ length: 40 }, (_, i) => {
  const done = i % 8 === 0; // 5 of 40 done, 35 open/in-progress -> comfortably >= 25 visible
  const dueDate = fmtDate(addDays(TODAY, i - 10));
  return {
    name: `${TASK_TITLES[i % TASK_TITLES.length]} #${i + 1}`,
    index: `t:${TASK_TITLES[i % TASK_TITLES.length]}`.toLowerCase(),
    tags: '',
    notes: '',
    author: avatarInfo(personsPrep, i),
    assignee: avatarInfo(personsPrep, i + 1),
    state: done ? 'done' : (i % 2 === 0 ? 'initial' : 'doing'),
    dueDate,
    completionDate: done ? dueDate : '',
    priority: ['low', 'medium', 'high'][i % 3],
    importance: ['low', 'medium', 'high'][i % 3],
    calendars: [],
    rank: '',
    relatedModelType: '',
    relatedKey: '',
    linkModelType: '',
    linkKey: '',
    tenants: ['okr'],
    isArchived: false,
    seedBatch: SEED_BATCH,
  };
});
const tasksPrep = prepare('tasks', tasksData);

// calevents (40) — dashboard section d-events
const caleventsData = Array.from({ length: 40 }, (_, i) => {
  const start = addDays(TODAY, i - 5);
  const responsible = [avatarInfo(personsPrep, i), avatarInfo(personsPrep, i + 2)];
  return {
    name: `${EVENT_TITLES[i % EVENT_TITLES.length]} #${i + 1}`,
    index: `c:${EVENT_TITLES[i % EVENT_TITLES.length]}`.toLowerCase(),
    tags: '',
    description: '',
    type: CALEVENT_TYPES[i % CALEVENT_TYPES.length],
    startDate: fmtDate(start),
    startTime: '1900',
    fullDay: false,
    durationMinutes: 120,
    endDate: '',
    periodicity: 'once',
    repeatUntilDate: '',
    seriesId: '',
    locationKey: '',
    calendars: [],
    url: '',
    urlLabel: '',
    responsiblePersons: responsible,
    isOpen: true,
    attendees: [],
    state: 'definitive',
    cancelMessage: '',
    columnLabel: '',
    pollMultiSelect: false,
    tenants: ['okr'],
    isArchived: false,
    seedBatch: SEED_BATCH,
  };
});
const caleventsPrep = prepare('calevents', caleventsData);

// invitations (40) — dashboard section d-invitations, mostly pending so they render
const invitationsData = Array.from({ length: 40 }, (_, i) => {
  const calevent = caleventsPrep[i % caleventsPrep.length];
  const invitee = personsPrep[i];
  const inviter = personsPrep[(i + 1) % personsPrep.length];
  const pending = i % 5 !== 0; // 32 of 40 pending, 8 answered
  return {
    index: `i:${invitee.data.lastName} ${invitee.data.firstName}`.toLowerCase(),
    tags: '',
    notes: '',
    inviteeKey: invitee.ref.id,
    inviteeFirstName: invitee.data.firstName,
    inviteeLastName: invitee.data.lastName,
    inviterKey: inviter.ref.id,
    inviterFirstName: inviter.data.firstName,
    inviterLastName: inviter.data.lastName,
    caleventKey: calevent.ref.id,
    name: calevent.data.name,
    date: calevent.data.startDate,
    state: pending ? 'pending' : 'accepted',
    role: 'required',
    sentAt: fmtDateTime(addDays(TODAY, -3)),
    respondedAt: pending ? '' : fmtDateTime(addDays(TODAY, -1)),
    isLocked: false,
    tenants: ['okr'],
    isArchived: false,
    seedBatch: SEED_BATCH,
  };
});
const invitationsPrep = prepare('invitations', invitationsData);

// activities (200) — audit log entries
const ACTIVITY_ACTIONS = ['create', 'update', 'delete', 'login', 'logout'];
const ACTIVITY_SCOPES = ['task', 'calevent', 'membership', 'person', 'invitation'];
const activitiesData = Array.from({ length: 200 }, (_, i) => {
  const ts = fmtDateTime(addDays(TODAY, -Math.floor(i / 10)));
  return {
    index: `t:${ts} c:${ACTIVITY_SCOPES[i % ACTIVITY_SCOPES.length]} a:${ACTIVITY_ACTIONS[i % ACTIVITY_ACTIONS.length]}`,
    timestamp: ts,
    scope: ACTIVITY_SCOPES[i % ACTIVITY_SCOPES.length],
    action: ACTIVITY_ACTIONS[i % ACTIVITY_ACTIONS.length],
    roleNeeded: 'admin',
    payload: '',
    author: avatarInfo(personsPrep, i),
    tenants: ['okr'],
    isArchived: false,
    seedBatch: SEED_BATCH,
  };
});
const activitiesPrep = prepare('activities', activitiesData);

// comments (200) — dashboard section d-messages, attached to tasks and calevents
const commentsData = Array.from({ length: 200 }, (_, i) => {
  const author = personsPrep[i % personsPrep.length];
  const onTask = i % 2 === 0;
  const parent = onTask ? tasksPrep[i % tasksPrep.length] : caleventsPrep[i % caleventsPrep.length];
  const parentModelType = onTask ? 'task' : 'calevent';
  return {
    index: `cm:${author.data.lastName}`.toLowerCase(),
    authorKey: author.ref.id,
    authorName: `${author.data.firstName} ${author.data.lastName}`,
    creationDateTime: fmtDateTime(addDays(TODAY, -Math.floor(i / 20))),
    parentKey: `${parentModelType}.${parent.ref.id}`,
    description: COMMENT_TEXTS[i % COMMENT_TEXTS.length],
    attachmentKeys: [],
    isArchived: false,
    tags: '',
    tenants: ['okr'],
    seedBatch: SEED_BATCH,
  };
});
const commentsPrep = prepare('comments', commentsData);

// resources (20)
const resourcesData = Array.from({ length: 20 }, (_, i) => ({
  name: RESOURCE_NAMES[i % RESOURCE_NAMES.length],
  index: `r:${RESOURCE_NAMES[i % RESOURCE_NAMES.length]}`.toLowerCase(),
  tags: '',
  description: '',
  type: 'rboat',
  subType: '',
  usage: '',
  currentValue: 0,
  load: '',
  weight: 0,
  color: '',
  brand: '',
  model: '',
  id: '',
  seats: 0,
  length: 0,
  width: 0,
  height: 0,
  data: [],
  tenants: ['okr'],
  isArchived: false,
  seedBatch: SEED_BATCH,
}));
const resourcesPrep = prepare('resources', resourcesData);

// ---------------------------------------------------------------------------
// Write everything, in dependency order, then print a summary.
// ---------------------------------------------------------------------------
const plan = [
  ['persons', personsPrep],
  ['addresses', addressesPrep],
  ['avatars', avatarsPrep],
  ['orgs', orgsPrep],
  ['groups', groupsPrep],
  ['memberships', membershipsPrep],
  ['tasks', tasksPrep],
  ['calevents', caleventsPrep],
  ['invitations', invitationsPrep],
  ['activities', activitiesPrep],
  ['comments', commentsPrep],
  ['resources', resourcesPrep],
];

console.log(`${DRY_RUN ? '[dry-run] ' : ''}Seeding tenant "okr" with seedBatch "${SEED_BATCH}"`);
let total = 0;
for (const [name, prepared] of plan) {
  await writeAll(name, prepared);
  total += prepared.length;
}
console.log(`${DRY_RUN ? '[dry-run] ' : ''}Done. Total documents: ${total}`);
