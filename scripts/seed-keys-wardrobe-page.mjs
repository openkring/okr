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
 * Second stage, `--request-flow` (spec 1.88): replaces the two chat-only buttons by the approval
 * flow. It runs INSTEAD of the stages above (they would reset the buttons to Workflow) and
 *
 *   1. sets contract-kinds/wardrobeLocker and contract-kinds/boathouseKey;
 *   2. upserts the i18nDefault rows (module 'workflow'): status texts (spec §5.3), request /
 *      approved / rejected chat texts and the approval task titles, five languages;
 *   3. creates three rules per kind: «Antrag» (contract.requested → requestApproval + openChat),
 *      «abgelehnt» and «bewilligt» (approval.decided → openChat);
 *   4. switches both button sections to ButtonAction.Contract (7, url = kind); a section whose
 *      action type is neither 6 nor 7 is logged and skipped;
 *   5. archives the two interim ui.buttonClicked rules (isArchived: true, never deleted).
 *
 * TIMING: run `--request-flow --apply` ONLY after the app release containing the
 * ButtonAction.Contract handling and the status/approval UI (spec 1.88 Task 10) is live
 * everywhere, and after the functions deploy (requestContract, getContractRequestStatus) — on
 * older bundles the switched buttons do nothing (spec 1.88 §10).
 *
 * Run with:  node scripts/seed-keys-wardrobe-page.mjs            (DRY RUN, writes nothing)
 *            node scripts/seed-keys-wardrobe-page.mjs --apply    (writes)
 *            node scripts/seed-keys-wardrobe-page.mjs --request-flow [--apply]
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: i18n rows by (module, key), rules by `name` + tenant, sections / page / menu row by
 * fixed ids, the parent menu's children by membership. Nothing is ever removed.
 * --request-flow: kinds by fixed id (set), i18n rows by (module, key), rules by name + tenant,
 * section switch and rule archiving are updates.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const APPLY = argv.includes('--apply');
const REQUEST_FLOW = argv.includes('--request-flow');
const TENANT = 'scs';

const KEY_GROUP = 'resourceAdmin';                // groups/<okey> «Schlüsselverwaltung»
const KEY_RESPONSIBILITY = 'quts1rewzl1ubx71tqu0'; // responsibilities/<okey> «Schlüsselverwaltung»
const PAGE_ID = 'keys_wardrobe';
const MENU_NAME = 'keys_wardrobe';
const PARENT_MENU = 'clubareal-menu';
const BUTTON_ACTION_WORKFLOW = 6;                 // ButtonAction.Workflow
const BUTTON_ACTION_CONTRACT = 7;                 // ButtonAction.Contract
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

/** Request flow (spec 1.88): status texts (§5.3), chat texts, approval task titles. {link} is filled by the client. */
const FLOW_MESSAGES = {
  'keys.lockerPending': {
    de: 'Du hast am {date} einen Garderobenkasten beantragt. Dein Antrag wird von {responsible} (Schlüsselverwaltung) im {link} beantwortet.',
    en: 'You requested a locker in the changing room on {date}. {responsible} (key management) will answer your request in the {link}.',
    fr: 'Tu as demandé un casier au vestiaire le {date}. {responsible} (gestion des clés) répondra à ta demande dans le {link}.',
    es: 'Pediste una taquilla en el vestuario el {date}. {responsible} (gestión de llaves) responderá a tu solicitud en el {link}.',
    it: 'Hai richiesto un armadietto nello spogliatoio il {date}. {responsible} (gestione delle chiavi) risponderà alla tua richiesta nella {link}.',
  },
  'keys.lockerApproved': {
    de: 'Dein Antrag vom {date} ist bewilligt. {responsible} meldet sich im {link} für die Übergabe.',
    en: 'Your request from {date} has been approved. {responsible} will get in touch in the {link} about the handover.',
    fr: 'Ta demande du {date} est acceptée. {responsible} te contactera dans le {link} pour la remise.',
    es: 'Tu solicitud del {date} está aprobada. {responsible} se pondrá en contacto contigo en el {link} para la entrega.',
    it: 'La tua richiesta del {date} è stata approvata. {responsible} ti scriverà nella {link} per la consegna.',
  },
  'keys.lockerOwned': {
    de: 'Du hast bereits einen Garderobenkasten.',
    en: 'You already have a locker in the changing room.',
    fr: 'Tu as déjà un casier au vestiaire.',
    es: 'Ya tienes una taquilla en el vestuario.',
    it: 'Hai già un armadietto nello spogliatoio.',
  },
  'keys.keyPending': {
    de: 'Du hast am {date} einen Schlüssel zum Bootshaus beantragt. Dein Antrag wird von {responsible} (Schlüsselverwaltung) im {link} beantwortet.',
    en: 'You requested a key to the boathouse on {date}. {responsible} (key management) will answer your request in the {link}.',
    fr: 'Tu as demandé une clé du hangar à bateaux le {date}. {responsible} (gestion des clés) répondra à ta demande dans le {link}.',
    es: 'Pediste una llave del cobertizo de botes el {date}. {responsible} (gestión de llaves) responderá a tu solicitud en el {link}.',
    it: 'Hai richiesto una chiave della rimessa il {date}. {responsible} (gestione delle chiavi) risponderà alla tua richiesta nella {link}.',
  },
  'keys.keyApproved': {
    de: 'Dein Antrag vom {date} ist bewilligt. {responsible} meldet sich im {link} für die Übergabe.',
    en: 'Your request from {date} has been approved. {responsible} will get in touch in the {link} about the handover.',
    fr: 'Ta demande du {date} est acceptée. {responsible} te contactera dans le {link} pour la remise.',
    es: 'Tu solicitud del {date} está aprobada. {responsible} se pondrá en contacto contigo en el {link} para la entrega.',
    it: 'La tua richiesta del {date} è stata approvata. {responsible} ti scriverà nella {link} per la consegna.',
  },
  'keys.keyOwned': {
    de: 'Du hast bereits einen Schlüssel zum Bootshaus.',
    en: 'You already have a key to the boathouse.',
    fr: 'Tu as déjà une clé du hangar à bateaux.',
    es: 'Ya tienes una llave del cobertizo de botes.',
    it: 'Hai già una chiave della rimessa.',
  },
  'keys.notActive': {
    de: 'Garderobenkästen und Schlüssel können nur Aktivmitglieder beantragen.',
    en: 'Only active members can request lockers and keys.',
    fr: 'Seuls les membres actifs peuvent demander des casiers et des clés.',
    es: 'Solo los miembros activos pueden solicitar taquillas y llaves.',
    it: 'Solo i soci attivi possono richiedere armadietti e chiavi.',
  },
  'keys.lockerRequested': {
    de: '{name} möchte einen Garderobenkasten. Der Antrag wartet auf deine Freigabe in der Aufgabe.',
    en: '{name} would like a locker in the changing room. The request is waiting for your approval in the task.',
    fr: '{name} aimerait un casier au vestiaire. La demande attend ton accord dans la tâche.',
    es: '{name} quiere una taquilla en el vestuario. La solicitud espera tu aprobación en la tarea.',
    it: '{name} vorrebbe un armadietto nello spogliatoio. La richiesta aspetta la tua approvazione nel compito.',
  },
  'keys.keyRequested': {
    de: '{name} möchte einen Schlüssel zum Bootshaus. Der Antrag wartet auf deine Freigabe in der Aufgabe.',
    en: '{name} would like a key to the boathouse. The request is waiting for your approval in the task.',
    fr: '{name} aimerait une clé du hangar à bateaux. La demande attend ton accord dans la tâche.',
    es: '{name} quiere una llave del cobertizo de botes. La solicitud espera tu aprobación en la tarea.',
    it: '{name} vorrebbe una chiave della rimessa. La richiesta aspetta la tua approvazione nel compito.',
  },
  'keys.requestRejected': {
    de: 'Dein Antrag wurde leider abgelehnt. {note}',
    en: 'Unfortunately, your request was declined. {note}',
    fr: 'Ta demande a malheureusement été refusée. {note}',
    es: 'Lamentablemente, tu solicitud fue rechazada. {note}',
    it: 'Purtroppo la tua richiesta è stata rifiutata. {note}',
  },
  'keys.requestApproved': {
    de: 'Dein Antrag ist bewilligt. {approverName} meldet sich hier für die Übergabe.',
    en: 'Your request has been approved. {approverName} will get in touch here about the handover.',
    fr: 'Ta demande est acceptée. {approverName} te contactera ici pour la remise.',
    es: 'Tu solicitud está aprobada. {approverName} se pondrá en contacto contigo aquí para la entrega.',
    it: 'La tua richiesta è stata approvata. {approverName} ti scriverà qui per la consegna.',
  },
  'keys.lockerApprovalTask': {
    de: 'Antrag Garderobenkasten prüfen: {name}',
    en: 'Review locker request: {name}',
    fr: 'Examiner la demande de casier : {name}',
    es: 'Revisar la solicitud de taquilla: {name}',
    it: 'Verificare la richiesta di armadietto: {name}',
  },
  'keys.keyApprovalTask': {
    de: 'Antrag Bootshaus-Schlüssel prüfen: {name}',
    en: 'Review boathouse key request: {name}',
    fr: 'Examiner la demande de clé du hangar : {name}',
    es: 'Revisar la solicitud de llave del cobertizo: {name}',
    it: 'Verificare la richiesta di chiave della rimessa: {name}',
  },
};

const KINDS = {
  wardrobeLocker: { name: 'Garderobenkasten', resourceType: 'locker', prefix: 'locker', section: 'keys_wardrobe_locker' },
  boathouseKey: { name: 'Schlüssel zum Bootshaus', resourceType: 'key', prefix: 'key', section: 'keys_boathouse_key' },
};
const INTERIM_RULES = ['Garderobenkasten → Schlüsselverwaltung', 'Bootshaus-Schlüssel → Schlüsselverwaltung'];
const RULE_NOTES = 'Seeded by scripts/seed-keys-wardrobe-page.mjs (spec 1.88)';
const step = (action, actionArg, messageKey = '', dueInDays = 0) => ({ action, actionArg, messageKey, dueInDays, writeBack: '' });

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

async function seedMessages(messages = MESSAGES) {
  for (const [key, text] of Object.entries(messages)) {
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

async function seedKinds() {
  for (const [kind, k] of Object.entries(KINDS)) {
    const doc = {
      tenants: [TENANT], isArchived: false, name: k.name,
      templateKey: '', contractType: 'lease', contractName: '', askGroupKey: KEY_GROUP, orgKey: TENANT,
      eligibility: ['activeMember', 'noOpenRequest', 'noActiveOwnership'],
      signers: [], terms: {},
      resourceType: k.resourceType, requiresAddress: false,
      statusMessages: {
        pending: MSG(`keys.${k.prefix}Pending`), approved: MSG(`keys.${k.prefix}Approved`),
        owned: MSG(`keys.${k.prefix}Owned`), notActive: MSG('keys.notActive'),
      },
    };
    const existing = (await db.collection('contract-kinds').doc(kind).get()).exists;
    console.log(`  contract-kinds/${kind} «${k.name}» (${k.resourceType}) ${existing ? '(update)' : '(create)'}${tag()}`);
    if (APPLY) await db.collection('contract-kinds').doc(kind).set(doc);
  }
}

async function upsertRule(rule) {
  const snap = await db.collection('workflow-rules').where('name', '==', rule.name).get();
  const existing = snap.docs.find((d) => (d.data().tenants ?? []).includes(TENANT));
  const doc = {
    tenants: [TENANT], isArchived: false,
    index: `n:${rule.name} e:${rule.event} r:${rule.responsibilityKey}`,
    tags: '', notes: RULE_NOTES, ...rule,
  };
  console.log(`  rule "${rule.name}" [${rule.event}; ${rule.probe} ${rule.probeArg}] → ${rule.steps.map((x) => `${x.action} ${x.actionArg}`).join(' + ')} ${existing ? '(update)' : '(create)'}${tag()}`);
  if (!APPLY) return;
  if (existing) await existing.ref.set(doc, { merge: true });
  else await db.collection('workflow-rules').add(doc);
}

async function seedFlowRules() {
  for (const [kind, k] of Object.entries(KINDS)) {
    await upsertRule({
      name: `${k.name}: Antrag`, event: 'contract.requested', probe: 'paramIs', probeArg: `kind=${kind}`,
      responsibilityKey: KEY_RESPONSIBILITY,
      steps: [step('requestApproval', kind, MSG(`keys.${k.prefix}ApprovalTask`), 14), step('openChat', KEY_GROUP, MSG(`keys.${k.prefix}Requested`))],
    });
    await upsertRule({
      name: `${k.name}: abgelehnt`, event: 'approval.decided', probe: 'paramIs,decisionIs:rejected', probeArg: `kind=${kind}`,
      responsibilityKey: '', steps: [step('openChat', KEY_GROUP, MSG('keys.requestRejected'))],
    });
    await upsertRule({
      name: `${k.name}: bewilligt`, event: 'approval.decided', probe: 'paramIs,decisionIs:approved', probeArg: `kind=${kind}`,
      responsibilityKey: '', steps: [step('openChat', KEY_GROUP, MSG('keys.requestApproved'))],
    });
  }
}

async function switchSections() {
  for (const [kind, k] of Object.entries(KINDS)) {
    const ref = db.collection('sections').doc(k.section);
    const data = (await ref.get()).data();
    const type = data?.properties?.action?.type;
    if (!data) { console.log(`  sections/${k.section}: missing — skipped`); continue; }
    if (type !== BUTTON_ACTION_WORKFLOW && type !== BUTTON_ACTION_CONTRACT) {
      console.log(`  sections/${k.section}: action type ${type} is neither Workflow (6) nor Contract (7) — skipped`);
      continue;
    }
    console.log(`  sections/${k.section}: action ${type} → Contract (7), url '${kind}'${tag()}`);
    if (APPLY) await ref.update({ 'properties.action.type': BUTTON_ACTION_CONTRACT, 'properties.action.url': kind });
  }
}

async function archiveInterimRules() {
  for (const name of INTERIM_RULES) {
    const snap = await db.collection('workflow-rules').where('name', '==', name).get();
    const docs = snap.docs.filter((d) => (d.data().tenants ?? []).includes(TENANT));
    if (!docs.length) { console.log(`  rule "${name}": not found — nothing to archive`); continue; }
    for (const d of docs) {
      if (d.data().isArchived) { console.log(`  rule "${name}" (${d.id}): already archived`); continue; }
      console.log(`  rule "${name}" (${d.id}): archive${tag()}`);
      if (APPLY) await d.ref.update({ isArchived: true });
    }
  }
}

async function main() {
  console.log(`seed-keys-wardrobe-page${REQUEST_FLOW ? ' --request-flow' : ''}: tenant '${TENANT}'${tag()}`);
  const { group, parent } = await preflight();
  if (REQUEST_FLOW) {
    await seedKinds();
    await seedMessages(FLOW_MESSAGES);
    await seedFlowRules();
    await switchSections();
    await archiveInterimRules();
  } else {
    await seedGroupChatMode(group);
    await seedMessages();
    await seedRules();
    await seedSections();
    await seedPage();
    await seedMenu(parent);
  }
  console.log(APPLY ? 'done (written)' : 'dry run - nothing written; re-run with --apply to write');
}

main().catch((error) => { console.error(error.message ?? error); exit(1); });
