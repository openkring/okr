/**
 * Generic seed: publishes a PDF/Handlebars template (+ version 1) to Firestore.
 *
 * Precondition: add your Handlebars template as scripts/templates/<template-id>.hbs
 *               (the file name without ".hbs" becomes the template id).
 *
 * Run with:  node scripts/seed-template.mjs <template-id>
 * Example:   node scripts/seed-template.mjs gss-spendenbestaetigung
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * The script extracts the {{placeholders}} from the template and asks you,
 * field by field, for the sample-data values, then for the template metadata.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, exit } from 'node:process';
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');

// ---- valid enum values (mirror libs/shared/models/.../pdf-template.model.ts) ----
const CATEGORIES = ['invoice', 'expense', 'report', 'dunning', 'other'];
const LANGUAGES = ['de', 'fr', 'it', 'en'];
const OUTPUT_FORMATS = ['pdf', 'docx', 'html'];
const ORIENTATIONS = ['portrait', 'landscape'];

/** List template ids (file names without ".hbs") found in scripts/templates/. */
function listTemplates() {
  return existsSync(TEMPLATES_DIR)
    ? readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.hbs')).map((f) => f.replace(/\.hbs$/, '')).sort()
    : [];
}

function printHelp() {
  const available = listTemplates();
  console.log(`
seed-template — publish a PDF/Handlebars template (+ version 1) to Firestore.

Usage:
  node scripts/seed-template.mjs <template-id>

Precondition:
  Add your Handlebars template to scripts/templates/<template-id>.hbs first.
  The file name without the ".hbs" extension becomes the template id.

The script will:
  1. read scripts/templates/<template-id>.hbs
  2. extract its {{placeholders}} and ask you for each sample-data value
  3. ask you for the template metadata (tenant, name, category, ...)
  4. write the template document + version 1 to the "templates" collection.

Requires:
  gcloud auth application-default login   (or GOOGLE_APPLICATION_CREDENTIALS)

Available templates in scripts/templates/:
${available.length ? available.map((t) => `  - ${t}`).join('\n') : '  (none — add a .hbs file first)'}
`);
}

/** Extract distinct {{placeholder}} variable names, in order of first appearance. */
function extractPlaceholders(html) {
  const names = [];
  // match simple variable refs like {{firstName}} or {{a.b}} — skip comments {{!, blocks {{#, {{/ and partials {{>
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    // payee.* is resolved server-side from the org, not sample data — skip it.
    if (m[1] === 'payee' || m[1].startsWith('payee.')) continue;
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

async function main() {
  const arg = process.argv[2];
  if (arg === '-h' || arg === '--help') {
    printHelp();
    return;
  }

  // Queue 'line' events so no input is dropped between prompts. This makes the
  // script work both interactively (TTY) and with piped/redirected stdin, where
  // readline.question() would otherwise race and lose lines.
  const rl = createInterface({ input: stdin, output: stdout, terminal: false });
  const lineQueue = [];
  const waiters = [];
  let inputClosed = false;
  rl.on('line', (line) => {
    if (waiters.length) waiters.shift()(line);
    else lineQueue.push(line);
  });
  rl.on('close', () => {
    inputClosed = true;
    while (waiters.length) waiters.shift()(undefined);
  });
  const nextLine = () => new Promise((resolve) => {
    if (lineQueue.length) resolve(lineQueue.shift());
    else if (inputClosed) resolve(undefined);
    else waiters.push(resolve);
  });
  const ask = async (label, def) => {
    const suffix = def !== undefined && def !== '' ? ` [${def}]` : '';
    stdout.write(`${label}${suffix}: `);
    const line = await nextLine();
    const answer = (line ?? '').trim();
    return answer === '' ? (def ?? '') : answer;
  };
  const askChoice = async (label, choices, def) => {
    let value;
    do {
      value = await ask(`${label} (${choices.join('/')})`, def);
    } while (!choices.includes(value));
    return value;
  };

  // ---- resolve the template id (from the argument, or by interactive selection) ----
  let templateId = arg ? arg.replace(/\.hbs$/, '') : undefined;
  if (!templateId) {
    const templates = listTemplates();
    if (!templates.length) {
      console.error(`\n✗ No templates found in ${TEMPLATES_DIR}.`);
      console.error(`  Add your Handlebars template as scripts/templates/<template-id>.hbs first.\n`);
      printHelp();
      rl.close();
      process.exitCode = 1;
      return;
    }
    console.log('\nAvailable templates in scripts/templates/:');
    templates.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    let choice;
    do {
      choice = await ask(`\nSelect a template (1-${templates.length})`, undefined);
    } while (!(Number(choice) >= 1 && Number(choice) <= templates.length));
    templateId = templates[Number(choice) - 1];
  }

  const hbsPath = join(TEMPLATES_DIR, `${templateId}.hbs`);
  if (!existsSync(hbsPath)) {
    console.error(`\n✗ Template not found: ${hbsPath}`);
    console.error(`  Add your Handlebars template as scripts/templates/${templateId}.hbs first.\n`);
    printHelp();
    rl.close();
    process.exitCode = 1;
    return;
  }
  const html = readFileSync(hbsPath, 'utf8');
  const placeholders = extractPlaceholders(html);

  console.log(`\nTemplate file: ${hbsPath}`);
  console.log(`Found ${placeholders.length} placeholder(s): ${placeholders.join(', ') || '(none)'}\n`);

  // ---- 1. sample data, field by field ----
  console.log('── Sample data (one value per placeholder) ──');
  const sampleData = {};
  for (const name of placeholders) {
    sampleData[name] = await ask(`  ${name}`, '');
  }

  // ---- 2. template metadata ----
  console.log('\n── Template metadata ──');
  let tenant;
  do {
    tenant = await ask('  tenant', undefined);
  } while (tenant === '');
  const name = await ask('  name', templateId);
  const description = await ask('  description', '');
  const category = await askChoice('  category', CATEGORIES, 'other');
  const language = await askChoice('  language', LANGUAGES, 'de');
  const defaultOutputFormat = await askChoice('  defaultOutputFormat', OUTPUT_FORMATS, 'pdf');
  const defaultFormat = await ask('  defaultFormat', 'A4');
  const defaultOrientation = await askChoice('  defaultOrientation', ORIENTATIONS, 'portrait');
  const attachQrSlip = (await askChoice('  attachQrSlip', ['y', 'n'], 'n')) === 'y';
  const qrSlipWithAmount = attachQrSlip
    ? (await askChoice('  qrSlipWithAmount', ['y', 'n'], 'n')) === 'y'
    : false;
  const payeeOrgId = await ask('  payeeOrgId (empty = tenant default org)', '');

  // ---- 3. confirm ----
  console.log('\n── Summary ──');
  console.log(`  templateId:          ${templateId}`);
  console.log(`  tenant:              ${tenant}`);
  console.log(`  name:                ${name}`);
  console.log(`  description:         ${description}`);
  console.log(`  category:            ${category}`);
  console.log(`  language:            ${language}`);
  console.log(`  defaultOutputFormat: ${defaultOutputFormat}`);
  console.log(`  defaultFormat:       ${defaultFormat}`);
  console.log(`  defaultOrientation:  ${defaultOrientation}`);
  console.log(`  attachQrSlip:        ${attachQrSlip}`);
  console.log(`  qrSlipWithAmount:    ${qrSlipWithAmount}`);
  console.log(`  payeeOrgId:          ${payeeOrgId || '(tenant default)'}`);
  console.log(`  sampleData:          ${JSON.stringify(sampleData)}`);

  const app = getApps().length ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  const exists = (await db.collection('templates').doc(templateId).get()).exists;
  if (exists) {
    console.log(`\n⚠ A template with id "${templateId}" already exists and will be overwritten (version 1).`);
  }

  const confirm = await ask(`\nWrite to project "${PROJECT_ID}"? (y/N)`, 'N');
  rl.close();
  if (confirm.toLowerCase() !== 'y') {
    console.log('Aborted — nothing written.');
    await deleteApp(app);
    return;
  }

  // ---- 4. write ----
  const now = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // yyyymmdd

  await db.collection('templates').doc(templateId).set({
    tenants: [tenant],
    isArchived: false,
    index: templateId,
    name,
    description,
    category,
    language,
    currentVersion: 1,
    draftVersion: null,
    status: 'published',
    defaultOutputFormat,
    defaultFormat,
    defaultOrientation,
    attachQrSlip,
    qrSlipWithAmount,
    payeeOrgId,
    sampleData: JSON.stringify(sampleData),
    payloadSchema: '',
    createdAt: now,
    createdBy: 'seed',
    updatedAt: now,
    updatedBy: 'seed',
  });

  await db.collection('templates').doc(templateId)
    .collection('versions').doc('1').set({
      version: 1,
      html,
      css: '',
      partials: {},
      assets: [],
      status: 'published',
      changelog: 'Initial seed',
      publishedAt: now,
      publishedBy: 'seed',
      createdAt: now,
      createdBy: 'seed',
    });

  console.log(`\n✓ Seeded template ${templateId} (version 1) for tenant ${tenant}.`);
  await deleteApp(app);
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
