/**
 * Pure logic of seed-email-templates.mjs (no Firestore, no env): fills the layout sources, builds the
 * template and version documents, parses the command line. The tenant table is NOT here — it is passed in
 * (the public repo names no tenant).
 */
import { readFileSync } from 'node:fs';

const SOURCES = new URL('./email-templates/', import.meta.url);
const source = (name) => readFileSync(new URL(name, SOURCES), 'utf8');

export const USAGE = 'Usage: node scripts/seed-email-templates.mjs [--tenant <id>] [--shared] [--update <okey>] [--apply]';

/** Document ids of the shared templates (design §7.2). A tenant copy is `<id>_<tenantId>`. */
export const LAYOUT_KEY = 'email-layout';
export const PLAIN_LAYOUT_KEY = 'email-layout-plain';
/** The «Logo-only» layout: a small logo top right, no band, the standard footer. Tenant docs only. */
export const LOGO_LAYOUT_KEY = 'email-layout-logo';
export const RESET_TEXT_KEY = 'email-text-password-reset';
export const SYSTEM_TENANT = 'system';
export const SEED_USER = 'seed';

/** Longest first, so `email-layout-plain_x` is not read as the base `email-layout`. */
const BASE_KEYS = [PLAIN_LAYOUT_KEY, RESET_TEXT_KEY, LOGO_LAYOUT_KEY, LAYOUT_KEY];

/** Seed-time placeholder -> field of a tenant row. Handlebars (`{{...}}`) is left to the renderer. */
const PLACEHOLDERS = {
  LOGO_URL: 'logoUrl',
  LOGO_ALT: 'logoAlt',
  LOGO_WIDTH: 'logoWidth',
  HEADER_LINK: 'headerLink',
  FOOTER_NAME: 'footerName',
  BAND_COLOR: 'bandColor',
  MARK_URL: 'markUrl',
  MARK_WIDTH: 'markWidth',
};

/** Values that land inside a `style` attribute: anything but the expected shape could close the attribute. */
const PATTERNS = {
  BAND_COLOR: /^#[0-9a-fA-F]{6}$/,
  MARK_WIDTH: /^\d{2,3}$/,
};

/**
 * Fills the `%%X%%` placeholders of a layout source from a tenant row. A placeholder whose value is missing,
 * a placeholder this script does not know and a value that would open Handlebars all throw: a half-filled
 * layout must not be written.
 */
export function fillLayout(sourceText, row) {
  return sourceText.replace(/%%([A-Z_]+)%%/g, (_match, name) => {
    const field = PLACEHOLDERS[name];
    if (!field) throw new Error(`fillLayout: unknown placeholder %%${name}%%`);
    const value = row?.[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`fillLayout: the row has no value for ${field} (%%${name}%%)`);
    }
    const text = String(value);
    if (text.includes('{{')) throw new Error(`fillLayout: ${field} (%%${name}%%) must not contain Handlebars`);
    if (PATTERNS[name] && !PATTERNS[name].test(text)) throw new Error(`fillLayout: ${field} (%%${name}%%) has an invalid value`);
    return text;
  });
}

export function nextVersion(doc) {
  return (doc?.currentVersion ?? 0) + 1;
}

/** Same format as `getTemplateIndex` (pdf-template.util.ts): `n:<name> c:<category> l:<language>`. */
function templateIndex({ name, category, language }) {
  return [['n', name], ['c', category], ['l', language]]
    .filter(([, value]) => value && value !== ' ')
    .map(([key, value]) => `${key}:${value}`)
    .join(' ');
}

const todayStoreDate = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

const SAMPLE_LAYOUT = JSON.stringify({
  app_name: 'Beispiel-App',
  year: '2026',
  contact_email: 'app@example.org',
  content: '<p>Hallo,</p><p>dies ist ein Beispieltext.</p>',
});
const SAMPLE_RESET = JSON.stringify({
  url: 'https://app.example.org/auth/action?mode=resetPassword&oobCode=abc',
  email: 'anna@example.org',
  app_name: 'Beispiel-App',
  login_id: 'anna',
});

/** The `templates/<okey>` document, with every field TemplateModel has; no `draftVersion`. */
function templateDoc({ okey, name, description, kind, tenants, sampleData, now }) {
  const base = { name, category: 'other', language: 'de' };
  return {
    kind,
    ...base,
    description,
    tenants,
    isArchived: false,
    index: templateIndex(base),
    status: 'published',
    currentVersion: 1,
    defaultOutputFormat: 'pdf',
    defaultFormat: 'A4',
    defaultOrientation: 'portrait',
    sampleData,
    payloadSchema: '',
    attachQrSlip: false,
    qrSlipWithAmount: false,
    payeeOrgId: '',
    addressWindow: 'none',
    createdAt: now,
    createdBy: SEED_USER,
    updatedAt: now,
    updatedBy: SEED_USER,
  };
}

/** The `templates/<okey>/versions/<n>` document, published. */
function versionDoc({ version, html, text, subject, changelog, now }) {
  return {
    version,
    html,
    css: '',
    subject,
    text,
    partials: {},
    assets: [],
    status: 'published',
    changelog,
    publishedAt: now,
    publishedBy: SEED_USER,
    createdAt: now,
    createdBy: SEED_USER,
  };
}

function seedDoc({ okey, tenants, name, description, kind, sampleData, html, text, subject = '', now, version = 1, changelog = 'Initial seed' }) {
  return {
    okey,
    path: `templates/${okey}`,
    template: templateDoc({ okey, name, description, kind, tenants, sampleData, now }),
    versionId: String(version),
    version: versionDoc({ version, html, text, subject, changelog, now }),
  };
}

const LAYOUT_DESCRIPTION = 'Kopf- und Fusszeile für E-Mails. Der Inhalt der Mail steht an der Stelle {{{content}}}.';
const LOGO_DESCRIPTION = 'E-Mail mit kleinem Logo oben rechts, ohne Farbband, mit der Fusszeile des Standards. Der Inhalt der Mail steht an der Stelle {{{content}}}.';
const PLAIN_DESCRIPTION = 'Schlichte E-Mail ohne Bild und Farben. Der Inhalt der Mail steht an der Stelle {{{content}}}.';
const RESET_DESCRIPTION = 'Text der Mail, mit der ein Passwort zurückgesetzt wird.';

function plainLayout(tenant, now) {
  return seedDoc({
    okey: tenant ? `${PLAIN_LAYOUT_KEY}_${tenant}` : PLAIN_LAYOUT_KEY,
    tenants: [tenant ?? SYSTEM_TENANT],
    name: 'E-Mail schlicht',
    description: PLAIN_DESCRIPTION,
    kind: 'emailLayout',
    sampleData: SAMPLE_LAYOUT,
    html: source('layout-plain.html'),
    text: source('layout-plain.txt'),
    now,
  });
}

function resetText(tenant, now) {
  return seedDoc({
    okey: tenant ? `${RESET_TEXT_KEY}_${tenant}` : RESET_TEXT_KEY,
    tenants: [tenant ?? SYSTEM_TENANT],
    name: 'Passwort zurücksetzen',
    description: RESET_DESCRIPTION,
    kind: 'emailText',
    sampleData: SAMPLE_RESET,
    html: source('text-password-reset.html'),
    text: source('text-password-reset.txt'),
    subject: source('text-password-reset.subject.txt'),
    now,
  });
}

function standardLayout(row, now) {
  if (!row?.tenant) throw new Error('standardLayout: the row has no tenant');
  return seedDoc({
    okey: `${LAYOUT_KEY}_${row.tenant}`,
    tenants: [row.tenant],
    name: 'E-Mail Standard',
    description: LAYOUT_DESCRIPTION,
    kind: 'emailLayout',
    sampleData: SAMPLE_LAYOUT,
    html: fillLayout(source('layout-standard.html'), row),
    text: fillLayout(source('layout-standard.txt'), row),
    now,
  });
}

/** The Logo-only logo of a tenant: `logo-master.png` beside the logo master, unless the row names one (`markUrl`). */
export function markUrlFor(row) {
  return row.markUrl || `https://bkaiser.imgix.net/tenant/${row.tenant}/logo/logo-master.png?w=128`;
}

function logoLayout(row, now) {
  if (!row?.tenant) throw new Error('logoLayout: the row has no tenant');
  const filled = { ...row, markUrl: markUrlFor(row), markWidth: row.markWidth ?? 64 };
  return seedDoc({
    okey: `${LOGO_LAYOUT_KEY}_${row.tenant}`,
    tenants: [row.tenant],
    name: 'Logo-only',
    description: LOGO_DESCRIPTION,
    kind: 'emailLayout',
    sampleData: SAMPLE_LAYOUT,
    html: fillLayout(source('layout-logo.html'), filled),
    text: fillLayout(source('layout-logo.txt'), filled),
    now,
  });
}

/**
 * The docs to seed: without a row the shared (`system`) templates, with a tenant row that tenant's standard
 * layout (`email-layout_<tenant>`) and its Logo-only layout (`email-layout-logo_<tenant>`). `now` is a StoreDate and defaults to today.
 */
export function templateDocs(row, { now = todayStoreDate() } = {}) {
  return row ? [standardLayout(row, now), logoLayout(row, now)] : [plainLayout(undefined, now), resetText(undefined, now)];
}

/**
 * The current source of one named doc, for `--update`. The okey says which source and which tenant row:
 * `email-layout_<t>` -> the standard layout filled from row `t`; the other bases have a shared doc
 * (`<base>`) and an optional tenant copy (`<base>_<t>`) built from the same source.
 */
export function docForOkey(okey, rows, { now = todayStoreDate(), version, changelog } = {}) {
  const base = BASE_KEYS.find((b) => okey === b || okey.startsWith(`${b}_`));
  if (!base) throw new Error(`docForOkey: ${okey} is not one of ${BASE_KEYS.join(', ')} (or <base>_<tenant>)`);
  const tenant = okey === base ? undefined : okey.slice(base.length + 1);
  if (base === LAYOUT_KEY) {
    if (!tenant) throw new Error(`docForOkey: ${okey} has no shared doc; name a tenant layout (${LAYOUT_KEY}_<tenant>)`);
    const row = rows?.[tenant];
    if (!row) throw new Error(`docForOkey: no row for tenant ${tenant} in the seed table`);
    return withVersion(standardLayout({ ...row, tenant }, now), version, changelog, now);
  }
  if (base === LOGO_LAYOUT_KEY) {
    if (!tenant) throw new Error(`docForOkey: ${okey} has no shared doc; name a tenant layout (${LOGO_LAYOUT_KEY}_<tenant>)`);
    const row = rows?.[tenant];
    if (!row) throw new Error(`docForOkey: no row for tenant ${tenant} in the seed table`);
    return withVersion(logoLayout({ ...row, tenant }, now), version, changelog, now);
  }
  const doc = base === PLAIN_LAYOUT_KEY ? plainLayout(tenant, now) : resetText(tenant, now);
  return withVersion(doc, version, changelog, now);
}

function withVersion(doc, version, changelog, now) {
  if (version === undefined) return doc;
  return { ...doc, versionId: String(version), version: { ...doc.version, version, changelog: changelog ?? doc.version.changelog, publishedAt: now, createdAt: now } };
}

export function parseArgs(argv) {
  const out = { apply: false, tenant: undefined, shared: false, update: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--shared') out.shared = true;
    else if (arg === '--tenant' || arg === '--update') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) return { error: `${arg} needs a value. ${USAGE}` };
      out[arg === '--tenant' ? 'tenant' : 'update'] = value;
      i++;
    } else return { error: `Unknown argument ${arg}. ${USAGE}` };
  }
  if (out.update && (out.tenant || out.shared)) return { error: `--update works alone (it names one doc). ${USAGE}` };
  if (!out.update && !out.tenant && !out.shared) return { error: USAGE };
  return out;
}
