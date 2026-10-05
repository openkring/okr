/**
 * Seeds the «Schlüssel und Garderobe» page under Clubareal (tenant scs).
 *
 * Two workflow buttons (ButtonAction.Workflow → emitUiEvent → `ui.buttonClicked`). Each one
 * fires a rule that runs `openChat` with the Schlüsselverwaltung group: the member gets their
 * own room with the group (chatMode 'ask'), and the bot posts the request into it. No code
 * change — the callable, the engine step and the outbox are all deployed.
 *
 *   1. groups/resourceAdmin.chatMode → 'ask' — without it openChat refuses every member who is
 *      not in the group («not a member of group 'resourceAdmin'»), i.e. everybody who asks;
 *   2. i18nDefault rows (module 'workflow') — the two chat texts;
 *   3. two workflow-rules, matched on the button section's name (paramIs:sourceName=…);
 *   4. two button sections, the page `keys_wardrobe`, and the menu row appended to
 *      `clubareal-menu`.
 *
 * The menu label is plain German text, not an `@item.*` key: a key would need an app release
 * before it renders, and the page content itself is German-only anyway.
 *
 * Run with:  node scripts/seed-keys-wardrobe-page.mjs            (DRY RUN, writes nothing)
 *            node scripts/seed-keys-wardrobe-page.mjs --apply    (writes)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: i18n rows by (module, key), rules by `name` + tenant, sections / page / menu row by
 * fixed ids, the parent menu's children by membership. Nothing is ever removed.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const APPLY = argv.includes('--apply');
const TENANT = 'scs';

const KEY_GROUP = 'resourceAdmin';                // groups/<okey> «Schlüsselverwaltung»
const KEY_RESPONSIBILITY = 'quts1rewzl1ubx71tqu0'; // responsibilities/<okey> «Schlüsselverwaltung»
const PAGE_ID = 'keys_wardrobe';
const MENU_NAME = 'keys_wardrobe';
const PARENT_MENU = 'clubareal-menu';
const BUTTON_ACTION_WORKFLOW = 6;                 // ButtonAction.Workflow
const VIEW_POSITION_BOTTOM = 2;                   // ViewPosition.Bottom: text above, button below
const I18N_MODULE = 'workflow';
const MSG = (key) => `@${I18N_MODULE}.${key}`;

/** Single braces: the engine fills {name} (the pressing member) and every event param. */
const MESSAGES = {
  'keys.wardrobeRequested': {
    de: '{name} möchte einen Garderobenkasten. Bitte meldet euch hier im Chat.',
    en: '{name} would like a locker in the changing room. Please reply here in the chat.',
    fr: '{name} aimerait un casier au vestiaire. Merci de répondre ici dans le chat.',
    es: '{name} quiere una taquilla en el vestuario. Por favor, responded aquí en el chat.',
    it: '{name} vorrebbe un armadietto nello spogliatoio. Rispondete qui nella chat.',
  },
  'keys.boathouseKeyRequested': {
    de: '{name} möchte einen Schlüssel zum Bootshaus. Bitte meldet euch hier im Chat.',
    en: '{name} would like a key to the boathouse. Please reply here in the chat.',
    fr: '{name} aimerait une clé du hangar à bateaux. Merci de répondre ici dans le chat.',
    es: '{name} quiere una llave del cobertizo de botes. Por favor, responded aquí en el chat.',
    it: '{name} vorrebbe una chiave della rimessa. Rispondete qui nella chat.',
  },
};

const BUTTONS = [
  {
    id: 'keys_wardrobe_locker',
    title: 'Garderobenkasten',
    text: '<p>Du möchtest einen eigenen Kasten in der Garderobe? Mit diesem Knopf schreibst du der Schlüsselverwaltung. '
      + 'Die Antwort findest du danach in deinem Chat mit der Schlüsselverwaltung.</p>',
    label: 'Ich möchte einen Garderobenkasten',
    icon: 'key',
    message: 'keys.wardrobeRequested',
    rule: 'Garderobenkasten → Schlüsselverwaltung',
  },
  {
    id: 'keys_boathouse_key',
    title: 'Schlüssel zum Bootshaus',
    text: '<p>Du brauchst einen Schlüssel zum Bootshaus? Mit diesem Knopf schreibst du der Schlüsselverwaltung. '
      + 'Die Antwort findest du danach in deinem Chat mit der Schlüsselverwaltung.</p>',
    label: 'Ich möchte einen Schlüssel zum Bootshaus',
    icon: 'key',
    message: 'keys.boathouseKeyRequested',
    rule: 'Bootshaus-Schlüssel → Schlüsselverwaltung',
  },
];

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const tag = () => (APPLY ? '' : ' (dry run)');

async function preflight() {
  const problems = [];
  const group = (await db.collection('groups').doc(KEY_GROUP).get()).data();
  if (!group || group.isArchived) problems.push(`group '${KEY_GROUP}' missing or archived`);
  else if (!(group.tenants ?? []).includes(TENANT)) problems.push(`group '${KEY_GROUP}' is not in tenant '${TENANT}'`);
  else if (!group.hasChat || !group.matrixRoomId) problems.push(`group '${KEY_GROUP}' has no chat`);
  const resp = (await db.collection('responsibilities').doc(KEY_RESPONSIBILITY).get()).data();
  if (!resp?.responsibleAvatar?.key) problems.push(`responsibility '${KEY_RESPONSIBILITY}' is vacant`);
  const parentSnap = await db.collection('menuItems').where('name', '==', PARENT_MENU).get();
  const parent = parentSnap.docs.find((d) => !d.data().isArchived && (d.data().tenants ?? []).includes(TENANT));
  if (!parent) problems.push(`menu '${PARENT_MENU}' not found for '${TENANT}'`);
  const icon = await db.collection('icons').where('name', '==', 'key').limit(1).get();
  if (icon.empty) console.log("  ! icon 'key' is not in the icons catalogue — buttons and menu row render blank");
  if (problems.length) {
    problems.forEach((p) => console.error(`  x ${p}`));
    throw new Error('preflight failed — nothing written');
  }
  console.log(`  preflight ok: group '${group.name}' (chatMode ${group.chatMode ?? 'shared (default)'}), `
    + `responsible ${resp.responsibleAvatar.name1} ${resp.responsibleAvatar.name2}, parent menu ${parent.id}`);
  return { group, parent };
}

async function seedGroupChatMode(group) {
  if (group.chatMode === 'ask') { console.log(`  groups/${KEY_GROUP}: chatMode already 'ask'`); return; }
  console.log(`  groups/${KEY_GROUP}: chatMode '${group.chatMode ?? 'shared'}' → 'ask'${tag()}`);
  if (APPLY) await db.collection('groups').doc(KEY_GROUP).update({ chatMode: 'ask' });
}

async function seedMessages() {
  for (const [key, text] of Object.entries(MESSAGES)) {
    const snap = await db.collection('i18nDefault').where('module', '==', I18N_MODULE).where('key', '==', key).limit(5).get();
    const existing = snap.docs.find((d) => !d.data().isArchived);
    console.log(`  i18nDefault ${MSG(key)} ${existing ? '(update)' : '(create)'}${tag()}`);
    if (!APPLY) continue;
    const row = { module: I18N_MODULE, key, ...text, isHtml: false, isArchived: false };
    if (existing) await existing.ref.set(row, { merge: true });
    else await db.collection('i18nDefault').add(row);
  }
}

async function seedRules() {
  for (const b of BUTTONS) {
    const snap = await db.collection('workflow-rules').where('name', '==', b.rule).get();
    const existing = snap.docs.find((d) => (d.data().tenants ?? []).includes(TENANT));
    const rule = {
      tenants: [TENANT], isArchived: false,
      index: `n:${b.rule} e:ui.buttonClicked r:${KEY_RESPONSIBILITY}`,
      tags: '', notes: 'Seeded by scripts/seed-keys-wardrobe-page.mjs',
      name: b.rule, event: 'ui.buttonClicked', probe: 'paramIs', probeArg: `sourceName=${b.id}`,
      // openChat addresses the group and never reads this; it documents who answers
      responsibilityKey: KEY_RESPONSIBILITY,
      steps: [{ action: 'openChat', actionArg: KEY_GROUP, messageKey: MSG(b.message), dueInDays: 0, writeBack: '' }],
    };
    console.log(`  rule "${b.rule}" [ui.buttonClicked; paramIs sourceName=${b.id}] → openChat ${KEY_GROUP} ${existing ? '(update)' : '(create)'}${tag()}`);
    if (!APPLY) continue;
    if (existing) await existing.ref.set(rule, { merge: true });
    else await db.collection('workflow-rules').add(rule);
  }
}

async function seedSections() {
  for (const b of BUTTONS) {
    // `name` IS what the rule matches on — emitUiEvent reads it from this document
    const section = {
      tenants: [TENANT], isArchived: false, state: 'published',
      type: 'button', name: b.id, index: `n:${b.id} t:button`,
      title: b.title, subTitle: '', notes: '', tags: '',
      color: 0, colSize: '12', roleNeeded: 'registered',
      content: { htmlContent: b.text, colSize: 12, position: VIEW_POSITION_BOTTOM },
      properties: {
        icon: { name: b.icon, size: 24, slot: 'start' },
        style: { label: b.label, shape: 'round', fill: 'solid', width: '380', height: '48', color: 0 },
        action: { type: BUTTON_ACTION_WORKFLOW, url: '', altText: b.label },
      },
    };
    console.log(`  sections/${b.id} (button «${b.label}», action Workflow)${tag()}`);
    if (APPLY) await db.collection('sections').doc(b.id).set(section);
  }
}

async function seedPage() {
  const existing = (await db.collection('pages').doc(PAGE_ID).get()).data();
  const page = {
    tenants: [TENANT], isArchived: false, isPrivate: true, state: 'published', type: 'content',
    name: 'Schlüssel und Garderobe', title: 'Schlüssel und Garderobe', subTitle: '', abstract: '',
    index: `n:Schlüssel und Garderobe k:${PAGE_ID}`, notes: '', tags: '', meta: [], blogType: '',
    bannerUrl: '', bannerAltText: '', logoUrl: '', logoAltText: '',
    sections: BUTTONS.map((b) => b.id),
  };
  console.log(`  pages/${PAGE_ID} «${page.title}» with ${page.sections.join(', ')} ${existing ? '(update)' : '(create)'}${tag()}`);
  if (APPLY) await db.collection('pages').doc(PAGE_ID).set(page, { merge: true });
}

async function seedMenu(parent) {
  const item = {
    tenants: [TENANT], isArchived: false,
    name: MENU_NAME, action: 'navigate', url: `/private/${PAGE_ID}/c-contentpage`,
    icon: 'key', label: 'Schlüssel und Garderobe', roleNeeded: 'registered',
    data: [], menuItems: [], description: '', tags: '',
    index: `n:${MENU_NAME} a:navigate k:${MENU_NAME}`,
  };
  const snap = await db.collection('menuItems').where('name', '==', MENU_NAME).get();
  const existing = snap.docs.find((d) => (d.data().tenants ?? []).includes(TENANT));
  const ref = existing?.ref ?? db.collection('menuItems').doc(MENU_NAME);
  console.log(`  menuItems/${ref.id} → ${item.url} ${existing ? '(update)' : '(create)'}${tag()}`);
  const children = parent.data().menuItems ?? [];
  const listed = children.includes(MENU_NAME);
  console.log(`  ${PARENT_MENU}: ${listed ? 'already lists it' : `append → [${[...children, MENU_NAME].join(', ')}]`}${tag()}`);
  if (!APPLY) return;
  await ref.set(item, { merge: true });
  if (!listed) await parent.ref.update({ menuItems: [...children, MENU_NAME] });
}

async function main() {
  console.log(`seed-keys-wardrobe-page: tenant '${TENANT}'${tag()}`);
  const { group, parent } = await preflight();
  await seedGroupChatMode(group);
  await seedMessages();
  await seedRules();
  await seedSections();
  await seedPage();
  await seedMenu(parent);
  console.log(APPLY ? 'done (written)' : 'dry run - nothing written; re-run with --apply to write');
}

main().catch((error) => { console.error(error.message ?? error); exit(1); });
