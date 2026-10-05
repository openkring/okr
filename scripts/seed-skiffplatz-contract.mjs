/**
 * Seeds the DB side of the Skiffplatz-Antrag (spec 1.87, plan Task 11).
 *
 * The code side (requestContract, the signContract/fileContract steps, esignWorkflowEvents, the
 * outbox signContract kind, the Contract button action) ships with the functions deploy and the
 * app release. Everything below lives in Firestore:
 *
 *   1. category items — workflow_event: contract.requested, esign.signeeCompleted,
 *      esign.completed, esign.failed; workflow_action: signContract, fileContract
 *      (labels ship in libs/system/workflow/feature/src/i18n, the categories translate items);
 *   2. contract-kinds/skiffPlatz — the request configuration (signers, terms, ask group);
 *   3. templates/skiffplatz-vereinbarung + versions/1 — HTML from
 *      apps/functions/src/contract/templates/skiffplatz-vereinbarung.html, asset 'logo' =
 *      the SCS pennant PNG already in Storage;
 *   4. i18nDefault rows (module 'workflow') — the chat and task texts the rules render;
 *   5. six workflow-rules (A–F) wiring the events to the steps;
 *   6. the «Antrag stellen» button section, appended to pages/skiffplatz.
 *
 * NOT done here (deliberately): enabling the `contracts` feature block for scs — that goes
 * through the feature picker at /tenant/features, which also writes the menu rows.
 *
 * Run with:  node scripts/seed-skiffplatz-contract.mjs                 (DRY RUN, writes nothing)
 *            node scripts/seed-skiffplatz-contract.mjs --apply         (writes)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: category items matched by `name`, i18n rows by (module, key), rules by `name` +
 * tenant, the contract kind / template / section by fixed ids, the page's section list by
 * membership. Re-running updates rather than duplicates; nothing is ever removed.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const BUCKET = 'bkaiser-org.appspot.com';
const APPLY = argv.includes('--apply');
const TENANT = 'scs';

const KIND = 'skiffPlatz';                       // must equal the requestApproval actionArg
const ASK_GROUP = 'Ausschuss Boote';              // groups/<okey> — the doc id IS this string
const PRESIDENT = 'president';                    // responsibilities/<okey>
const RESSORT_BOOTE_NAME = 'Ressort Boote';       // looked up by name, its okey is random
const TEMPLATE_ID = 'skiffplatz-vereinbarung';
const LOGO_PATH = 'tenant/scs/logo/scs-wordmark.png';
const PAGE_ID = 'skiffplatz';
const SECTION_ID = 'skiffplatz_antrag';
const BUTTON_ACTION_CONTRACT = 7;                 // ButtonAction.Contract (appended after Workflow = 6)
const VIEW_POSITION_LEFT = 3;                     // ViewPosition.Left
const I18N_MODULE = 'workflow';
const MSG = (key) => `@${I18N_MODULE}.${key}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_HTML = join(__dirname, '../apps/functions/src/contract/templates/skiffplatz-vereinbarung.html');

const NEW_ITEMS = {
  workflow_event: [
    { name: 'contract.requested', icon: 'contract' },
    { name: 'esign.signeeCompleted', icon: 'checkbox' },
    { name: 'esign.completed', icon: 'checkbox-circle' },
    { name: 'esign.failed', icon: 'warning' },
  ],
  workflow_action: [
    { name: 'signContract', icon: 'shield' },
    { name: 'fileContract', icon: 'document' },
  ],
};

/** Chat and task texts. Single braces: the engine fills {name} and every event param. */
const MESSAGES = {
  'contract.skiffRequested': {
    de: 'Neuer Antrag für einen Skiff-Lagerplatz: {name}. Bitte prüft den Antrag und entscheidet in der Freigabe.',
    en: 'New request for a skiff storage place: {name}. Please review it and decide in the approval.',
    fr: 'Nouvelle demande de place pour skiff : {name}. Merci de l’examiner et de décider dans la validation.',
    es: 'Nueva solicitud de plaza para skiff: {name}. Revisadla y decidid en la aprobación.',
    it: 'Nuova richiesta di posto per skiff: {name}. Esaminatela e decidete nell’approvazione.',
  },
  'contract.skiffApprovalTask': {
    de: 'Antrag Skiff-Lagerplatz prüfen: {name}',
    en: 'Review skiff storage request: {name}',
    fr: 'Examiner la demande de place pour skiff : {name}',
    es: 'Revisar la solicitud de plaza para skiff: {name}',
    it: 'Esaminare la richiesta di posto per skiff: {name}',
  },
  'contract.skiffRejected': {
    de: 'Dein Antrag für einen Skiff-Lagerplatz wurde leider abgelehnt. {note}',
    en: 'Unfortunately your request for a skiff storage place was declined. {note}',
    fr: 'Ta demande de place pour skiff a malheureusement été refusée. {note}',
    es: 'Lamentablemente tu solicitud de plaza para skiff ha sido rechazada. {note}',
    it: 'Purtroppo la tua richiesta di posto per skiff è stata respinta. {note}',
  },
  'contract.skiffApproved': {
    de: 'Dein Antrag ist bewilligt. Du bekommst die Vereinbarung gleich per E-Mail von DeepSign zum Unterschreiben.',
    en: 'Your request is approved. You will shortly receive the agreement by e-mail from DeepSign to sign.',
    fr: 'Ta demande est acceptée. Tu recevras sous peu l’accord par e-mail de DeepSign pour le signer.',
    es: 'Tu solicitud ha sido aprobada. En breve recibirás el acuerdo por correo de DeepSign para firmarlo.',
    it: 'La tua richiesta è approvata. A breve riceverai l’accordo via e-mail da DeepSign da firmare.',
  },
  'contract.skiffSigned': {
    de: '{signeeName} hat die Vereinbarung unterschrieben ({signedCount}/{signeeCount}).',
    en: '{signeeName} has signed the agreement ({signedCount}/{signeeCount}).',
    fr: '{signeeName} a signé l’accord ({signedCount}/{signeeCount}).',
    es: '{signeeName} ha firmado el acuerdo ({signedCount}/{signeeCount}).',
    it: '{signeeName} ha firmato l’accordo ({signedCount}/{signeeCount}).',
  },
  'contract.skiffFiled': {
    de: 'Die Vereinbarung ist vollständig unterschrieben. Du findest sie hier: {contractLink}',
    en: 'The agreement is fully signed. You can find it here: {contractLink}',
    fr: 'L’accord est entièrement signé. Tu le trouves ici : {contractLink}',
    es: 'El acuerdo está firmado por todos. Lo encuentras aquí: {contractLink}',
    it: 'L’accordo è firmato da tutti. Lo trovi qui: {contractLink}',
  },
  'contract.skiffFailed': {
    de: 'Bei der Vereinbarung ist etwas schiefgelaufen. Der Ausschuss Boote kümmert sich darum.',
    en: 'Something went wrong with the agreement. The boat committee is taking care of it.',
    fr: 'Un problème est survenu avec l’accord. La commission des bateaux s’en occupe.',
    es: 'Algo ha fallado con el acuerdo. La comisión de botes se ocupa de ello.',
    it: 'Qualcosa è andato storto con l’accordo. La commissione barche se ne occupa.',
  },
};

const step = (action, actionArg, messageKey = '', dueInDays = 0) =>
  ({ action, actionArg, messageKey, dueInDays, writeBack: '' });   // writeBack MUST stay '' (subject is a person)

/** responsibilityKey '' is filled for rule A at runtime of this script (Ressort Boote okey). */
const RULES = [
  { name: 'Skiffplatz: Antrag → Ausschuss Boote', event: 'contract.requested', probe: 'paramIs', probeArg: `kind=${KIND}`,
    responsibility: 'ressortBoote',
    steps: [step('requestApproval', KIND, MSG('contract.skiffApprovalTask'), 14), step('openChat', ASK_GROUP, MSG('contract.skiffRequested'))] },
  { name: 'Skiffplatz: Antrag abgelehnt', event: 'approval.decided', probe: `paramIs,decisionIs:rejected`, probeArg: `kind=${KIND}`,
    steps: [step('openChat', ASK_GROUP, MSG('contract.skiffRejected'))] },
  { name: 'Skiffplatz: Antrag bewilligt → Unterschrift', event: 'approval.decided', probe: `paramIs,decisionIs:approved`, probeArg: `kind=${KIND}`,
    steps: [step('openChat', ASK_GROUP, MSG('contract.skiffApproved')), step('signContract', KIND)] },
  { name: 'Skiffplatz: Unterschrift erhalten', event: 'esign.signeeCompleted', probe: 'paramIs', probeArg: `kind=${KIND}`,
    steps: [step('openChat', ASK_GROUP, MSG('contract.skiffSigned'))] },
  { name: 'Skiffplatz: Vertrag ablegen', event: 'esign.completed', probe: 'paramIs', probeArg: `kind=${KIND}`,
    steps: [step('fileContract', KIND), step('openChat', ASK_GROUP, MSG('contract.skiffFiled'))] },
  { name: 'Skiffplatz: Unterschrift fehlgeschlagen', event: 'esign.failed', probe: 'paramIs', probeArg: `kind=${KIND}`,
    steps: [step('openChat', ASK_GROUP, MSG('contract.skiffFailed'))] },
];

if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
const db = getFirestore();
const tag = () => (APPLY ? '' : ' (dry run)');

async function findCategory(name) {
  const snap = await db.collection('categories').where('name', '==', name).get();
  const docs = snap.docs.filter((d) => !d.data().isArchived);
  return docs.find((d) => (d.data().tenants ?? []).includes(TENANT))
    ?? docs.find((d) => (d.data().tenants ?? []).includes('system'));
}

async function seedCategoryItems() {
  for (const [categoryName, newItems] of Object.entries(NEW_ITEMS)) {
    const category = await findCategory(categoryName);
    if (!category) throw new Error(`category '${categoryName}' not found for '${TENANT}' or 'system'`);
    const items = category.data().items ?? [];
    let added = 0;
    for (const it of newItems) {
      if (items.some((i) => i.name === it.name)) { console.log(`  ${categoryName}: '${it.name}' already present`); continue; }
      items.push({ name: it.name, icon: it.icon, color: '', abbreviation: '' });
      added++;
      console.log(`  ${categoryName}: '${it.name}' (icon ${it.icon}) ${APPLY ? 'added' : 'would be added'}`);
    }
    if (added > 0 && APPLY) await category.ref.update({ items });
  }
}

async function preflight() {
  const problems = [];
  const group = (await db.collection('groups').doc(ASK_GROUP).get()).data();
  if (!group || group.isArchived) problems.push(`group '${ASK_GROUP}' missing or archived`);
  else if (group.chatMode !== 'ask') problems.push(`group '${ASK_GROUP}' has chatMode '${group.chatMode}', expected 'ask'`);
  const president = (await db.collection('responsibilities').doc(PRESIDENT).get()).data();
  if (!president?.responsibleAvatar?.key) problems.push(`responsibility '${PRESIDENT}' has no responsible person`);
  const snap = await db.collection('responsibilities').where('name', '==', RESSORT_BOOTE_NAME).get();
  const ressort = snap.docs.find((d) => !d.data().isArchived && (d.data().tenants ?? []).includes(TENANT));
  if (!ressort?.data().responsibleAvatar?.key) problems.push(`responsibility '${RESSORT_BOOTE_NAME}' not found or vacant`);
  const [logoExists] = await getStorage().bucket().file(LOGO_PATH).exists();
  if (!logoExists) problems.push(`logo '${LOGO_PATH}' not in Storage`);
  const page = (await db.collection('pages').doc(PAGE_ID).get()).data();
  if (!page) problems.push(`page '${PAGE_ID}' not found`);
  const config = (await db.collection('app-config').doc(TENANT).get()).data() ?? {};
  if (!config.appDomain) problems.push(`app-config/${TENANT}.appDomain is empty (fileContract builds the link from it)`);
  if (!(config.enabledFeatures ?? []).includes('contracts')) {
    console.log(`  ! feature 'contracts' is not enabled for ${TENANT} — enable it in /tenant/features, or the chat link opens nothing`);
  }
  if (problems.length) {
    problems.forEach((p) => console.error(`  x ${p}`));
    throw new Error('preflight failed — nothing written');
  }
  console.log(`  preflight ok: group '${ASK_GROUP}' (ask), president → ${president.responsibleAvatar.name1} ${president.responsibleAvatar.name2}, ` +
    `${RESSORT_BOOTE_NAME} (${ressort.id}) → ${ressort.data().responsibleAvatar.name1} ${ressort.data().responsibleAvatar.name2}`);
  return { ressortBooteKey: ressort.id, page };
}

async function seedContractKind(ressortBooteKey) {
  const kind = {
    tenants: [TENANT], isArchived: false,
    name: 'Skiff-Lagerplatz',
    templateKey: TEMPLATE_ID,
    contractType: 'lease',
    contractName: 'Skiff-Lagerplatz {name}',
    askGroupKey: ASK_GROUP,
    orgKey: TENANT,
    eligibility: ['activeMember', 'noOpenRequest'],
    signers: [
      { role: 'applicant', responsibilityKey: '', signOrder: 0, label: 'Mieterin / Mieter' },
      { role: 'responsibility', responsibilityKey: PRESIDENT, signOrder: 1, label: 'Präsident SCS' },
      { role: 'responsibility', responsibilityKey: ressortBooteKey, signOrder: 1, label: 'Ressort Boote SCS' },
    ],
    // bare numbers: the template renders 'CHF {{terms.rent}}.-' (Ruling R7)
    terms: { rent: '600', insurance: '50', total: '650', noticeOursMonths: '6', noticeTheirsMonths: '1' },
  };
  console.log(`  contract-kinds/${KIND}: signers president + ${ressortBooteKey}, terms ${JSON.stringify(kind.terms)}${tag()}`);
  if (APPLY) await db.collection('contract-kinds').doc(KIND).set(kind);
}

async function seedTemplate() {
  const html = readFileSync(TEMPLATE_HTML, 'utf8');
  const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sampleData = {
    applicant: { name: 'Anna Muster', street: 'Seestrasse 1', zipCity: '8712 Stäfa' },
    date: '05.10.2026',
    terms: { rent: '600', insurance: '50', total: '650' },
    signatureBlocks: [
      { pattern: '#deepsign#anna@example.ch#', name: 'Anna Muster', label: 'Mieterin / Mieter', signOrder: 0 },
      { pattern: '#deepsign#praesident@example.ch#', name: 'Vorname Name', label: 'Präsident SCS', signOrder: 1 },
      { pattern: '#deepsign#boote@example.ch#', name: 'Vorname Name', label: 'Ressort Boote SCS', signOrder: 1 },
    ],
  };
  const existing = (await db.collection('templates').doc(TEMPLATE_ID).get()).data();
  console.log(`  templates/${TEMPLATE_ID} v1 (${html.length} chars, asset logo → ${LOGO_PATH}) ${existing ? '(update)' : '(create)'}${tag()}`);
  if (!APPLY) return;
  await db.collection('templates').doc(TEMPLATE_ID).set({
    tenants: [TENANT], isArchived: false, index: TEMPLATE_ID,
    name: 'Vereinbarung Skiff-Lagerplatz', description: 'Mietvereinbarung für einen Skiff-Lagerplatz (spec 1.87), September 2024',
    category: 'other', language: 'de', currentVersion: 1, draftVersion: null, status: 'published',
    defaultOutputFormat: 'pdf', defaultFormat: 'A4', defaultOrientation: 'portrait',
    attachQrSlip: false, qrSlipWithAmount: false, payeeOrgId: '',
    sampleData: JSON.stringify(sampleData), payloadSchema: '',
    createdAt: existing?.createdAt ?? now, createdBy: existing?.createdBy ?? 'seed', updatedAt: now, updatedBy: 'seed',
  });
  await db.collection('templates').doc(TEMPLATE_ID).collection('versions').doc('1').set({
    version: 1, html, css: '', partials: {},
    assets: [{ key: 'logo', storagePath: LOGO_PATH, mimeType: 'image/png' }],
    status: 'published', changelog: 'Seeded by scripts/seed-skiffplatz-contract.mjs',
    publishedAt: now, publishedBy: 'seed', createdAt: now, createdBy: 'seed',
  });
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

async function seedRules(ressortBooteKey) {
  for (const r of RULES) {
    const responsibilityKey = r.responsibility === 'ressortBoote' ? ressortBooteKey : '';
    const snap = await db.collection('workflow-rules').where('name', '==', r.name).get();
    const existing = snap.docs.find((d) => (d.data().tenants ?? []).includes(TENANT));
    const rule = {
      tenants: [TENANT], isArchived: false,
      index: `n:${r.name} e:${r.event} r:${responsibilityKey}`,
      tags: '', notes: 'Seeded by scripts/seed-skiffplatz-contract.mjs (spec 1.87)',
      name: r.name, event: r.event, probe: r.probe, probeArg: r.probeArg,
      responsibilityKey, steps: r.steps,
    };
    console.log(`  rule "${r.name}" [${r.event}; ${r.probe} ${r.probeArg}] → ${r.steps.map((s) => s.action).join(' + ')} ${existing ? '(update)' : '(create)'}${tag()}`);
    if (!APPLY) continue;
    if (existing) await existing.ref.set(rule, { merge: true });
    else await db.collection('workflow-rules').add(rule);
  }
}

async function seedButton(page) {
  const section = {
    tenants: [TENANT], isArchived: false, state: 'published',
    type: 'button', name: SECTION_ID, index: `n:${SECTION_ID} t:button`,
    title: 'Skiff-Lagerplatz beantragen', subTitle: '', notes: '', tags: '',
    color: 0, colSize: '12', roleNeeded: 'registered',
    content: {
      htmlContent: '<p>Als Aktivmitglied kannst du hier einen Skiff-Lagerplatz beantragen. Deine Angaben werden automatisch in die Vereinbarung übernommen. ' +
        'Nach der Bewilligung durch den Ausschuss Boote bekommst du die Vereinbarung per E-Mail zum Unterschreiben. Den Verlauf findest du im Chat mit dem Ausschuss.</p>',
      colSize: 6, position: VIEW_POSITION_LEFT,
    },
    properties: {
      icon: { name: 'contract', size: 24, slot: 'start' },
      style: { label: 'Antrag stellen', shape: 'round', fill: 'solid', width: '180', height: '44', color: 0 },
      action: { type: BUTTON_ACTION_CONTRACT, url: KIND, altText: 'Antrag stellen' },
    },
  };
  const sections = page.sections ?? [];
  const onPage = sections.includes(SECTION_ID);
  console.log(`  sections/${SECTION_ID} (button «Antrag stellen», action Contract → '${KIND}')${tag()}`);
  console.log(`  pages/${PAGE_ID}: ${onPage ? 'already lists the section' : `append section (position ${sections.length + 1} of ${sections.length + 1})`}${tag()}`);
  if (!APPLY) return;
  await db.collection('sections').doc(SECTION_ID).set(section);
  if (!onPage) await db.collection('pages').doc(PAGE_ID).update({ sections: [...sections, SECTION_ID] });
}

async function main() {
  console.log(`seed-skiffplatz-contract: tenant '${TENANT}'${tag()}`);
  const { ressortBooteKey, page } = await preflight();
  await seedCategoryItems();
  await seedContractKind(ressortBooteKey);
  await seedTemplate();
  await seedMessages();
  await seedRules(ressortBooteKey);
  await seedButton(page);
  console.log(APPLY ? 'done (written)' : 'dry run - nothing written; re-run with --apply to write');
}

main().catch((error) => { console.error(error.message ?? error); exit(1); });
