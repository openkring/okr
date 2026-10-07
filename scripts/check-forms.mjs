#!/usr/bin/env node
/**
 * Guards the three rules in the `building-forms` skill that, when broken, make a modal silently
 * unsaveable: the change-confirmation banner is gated on the Vest suite being valid, so a rule the
 * user can neither see nor satisfy reads as "the save button is gone".
 *
 *   1. no length cap on a selector value, a generated value, or a foreign key
 *   2. a template [maxLength] must be the constant the suite enforces, bound as a member
 *   3. every validated field must render its errors under itself
 *   4. a modal that collects input is header + change-confirmation + one form component:
 *      no raw Ionic inputs or [(ngModel)] typed into the modal, and a modal that renders an
 *      okr-*-form shows okr-change-confirmation. Pickers, wizards and tools that are not
 *      edit dialogs are listed in MODAL_ALLOWLIST, each with its reason.
 *
 * Usage: node scripts/check-forms.mjs   (exit 1 on any finding — CI friendly)
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = (pattern) =>
  execSync(`find libs -name '${pattern}' -not -path '*/node_modules/*'`, { encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();

const CONSTANTS = Object.fromEntries(
  [...readFileSync('libs/shared/constants/src/lib/constants.ts', 'utf8')
    .matchAll(/export const (\w+)\s*=\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));

/** values chosen from a catalogue: validity is membership, never a character count */
const SELECTOR = new Set(['state', 'currency', 'periodicity', 'action', 'roleNeeded', 'gender',
  'type', 'subType', 'category', 'membershipCategory', 'membershipCategoryNew', 'reason',
  'priority', 'importance', 'countryCode', 'addressChannel', 'addressUsage', 'albumStyle',
  'source', 'usage', 'parentModelType', 'modelType', 'icon', 'avatar']);
/** values produced by code: the user cannot shorten them, so a cap can only ever be wrong */
const GENERATED = new Set(['okey', 'index', 'uid', 'seriesId', 'fullPath', 'path', 'roomId',
  'placeId']);
const isGenerated = (f) => GENERATED.has(f) || f.endsWith('Key');
/** prose fields — a 30-character description is always a mistake */
const LONG_TEXT = new Set(['description', 'notes', 'abstract']);

const HAS_MAXLENGTH = new Set(['text-input', 'number-input', 'notes-input', 'email', 'phone',
  'iban', 'url', 'password-input']);

const PRIMITIVE = String.raw`<okr-(text-input|number-input|notes-input|email|phone|iban|url|password-input|cat-select|category-select|date-input|time-input|checkbox|color|amount-input|country-select)\b`;

const findings = [];
const report = (file, line, msg) => findings.push(`${file}:${line}  ${msg}`);

// ---------------------------------------------------------------- suites
const suiteFile = new Map();      // suite name -> validations file
const suiteFields = new Map();    // validations file -> Set<field>
const suiteCaps = new Map();      // validations file -> Map<field, capExpr>

for (const path of files('*.validations.ts')) {
  if (path.endsWith('.spec.ts')) continue;
  const src = readFileSync(path, 'utf8');
  for (const m of src.matchAll(/export const (\w+)\s*=\s*staticSuite/g)) suiteFile.set(m[1], path);
  suiteFields.set(path, new Set(
    [...src.matchAll(/(?:[A-Za-z]+Validations|test)\(\s*'([A-Za-z0-9_.]+)'/g)].map((m) => m[1])));
  const caps = new Map();
  const seenValues = new Map();  // model property -> the field names it is filed under
  src.split('\n').forEach((line, i) => {
    const m = line.match(/stringValidations\(\s*'([A-Za-z0-9_]+)'\s*,\s*([^,()]+?)\s*(?:,\s*([A-Za-z_][A-Za-z_0-9]*|\d+))?\s*[,)]/);
    if (!m) return;
    const [, field, value, cap] = m;
    if (cap && cap !== 'undefined') {
      caps.set(field, cap);
      if (SELECTOR.has(field)) report(path, i + 1, `rule 1: '${field}' is a selector value — drop the ${cap} cap (pass undefined)`);
      else if (isGenerated(field)) report(path, i + 1, `rule 1: '${field}' is generated — drop the ${cap} cap (pass undefined)`);
      else if (LONG_TEXT.has(field) && CONSTANTS[cap] !== CONSTANTS.DESCRIPTION_LENGTH) report(path, i + 1, `rule 3: '${field}' is prose — use DESCRIPTION_LENGTH, not ${cap}`);
    }
    // A value reused by a LATER rule under a different name is the copy/paste signature that
    // shipped five broken rules in categoryItemValidations. A one-off alias (docType -> model.type)
    // is deliberate and stays quiet.
    const prop = value.replace(/\s*\?\?.*$/, '').trim();
    if (/^model[.?]/.test(prop)) {
      const names = seenValues.get(prop) ?? new Set();
      names.add(field);
      seenValues.set(prop, names);
      if (names.size > 1) report(path, i + 1, `field/value mismatch: ${prop} is filed under ${[...names].map((n) => `'${n}'`).join(' and ')} — check you passed the field's own value`);
    }
  });
  suiteCaps.set(path, caps);
  // nested test() — the inner helpers file under their own field and the wrapper always passes
  const nested = src.match(/test\([^)]*\)\s*=>\s*\{[^}]*[A-Za-z]+Validations\(/s);
  if (nested) report(path, 1, 'nested test(): move the helpers into an omitWhen() block instead');
}

// ---------------------------------------------------------------- forms
for (const path of [...files('*.form.ts'), ...files('*-edit.modal.ts')]) {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const used = [...new Set([...src.matchAll(/\b(\w+Validations)\b/g)].map((m) => m[1]))]
    .filter((s) => suiteFile.has(s)).map((s) => suiteFile.get(s));
  if (!used.length) continue;
  const fields = new Set(used.flatMap((f) => [...suiteFields.get(f)]));
  const caps = new Map(used.flatMap((f) => [...suiteCaps.get(f)]));

  const resolve = (token) => {
    if (!token) return null;
    if (/^\d+$/.test(token)) return Number(token);
    if (token in CONSTANTS) return CONSTANTS[token];
    const m = src.match(new RegExp(`\\b${token}\\s*=\\s*([A-Za-z_][A-Za-z_0-9]*|\\d+)\\s*;`));
    if (!m) return null;
    return /^\d+$/.test(m[1]) ? Number(m[1]) : CONSTANTS[m[1]] ?? null;
  };

  for (let i = 0; i < lines.length; i++) {
    if (!new RegExp(PRIMITIVE).test(lines[i])) continue;
    const prim = lines[i].match(new RegExp(PRIMITIVE))[1];
    let chunk = lines[i], j = i + 1;
    while (!chunk.includes('/>') && j < lines.length && j - i < 14) chunk += lines[j++];
    const fm = chunk.match(/on(?:FieldChange|BooleanChange)\('([A-Za-z0-9_]+)'/);
    const field = fm?.[1];
    const readOnly = chunk.includes('readOnly]="true"');
    i = j - 1;
    if (!field || readOnly) continue;

    // rule 3 — a validated field must show its errors
    if (fields.has(field)) {
      const near = lines.slice(j, j + 2).join('\n');
      const shown = prim === 'notes-input'
        ? chunk.includes(`${field}Errors()`)
        : (near.includes('okr-error-note') || chunk.includes('okr-error-note'));
      if (!shown) report(path, i + 1, `rule 3: '${field}' is validated but renders no okr-error-note`);
    }
    // rule 2 — the template cap must be the suite's cap, bound as a member.
    // Only the primitives that actually take a [maxLength] input.
    if (!HAS_MAXLENGTH.has(prim)) continue;
    const tokenMatch = chunk.match(/\[maxLength\]="?([A-Za-z_0-9]+)"?/);
    const cap = caps.get(field);
    const capVal = cap ? (/^\d+$/.test(cap) ? Number(cap) : CONSTANTS[cap]) : null;
    if (capVal == null) continue;
    if (!tokenMatch) { report(path, i + 1, `rule 2: '${field}' is capped at ${cap} but the input has no [maxLength]`); continue; }
    const tplVal = resolve(tokenMatch[1]);
    if (tplVal !== capVal) report(path, i + 1, `rule 2: '${field}' [maxLength]=${tokenMatch[1]} (${tplVal}) but the suite enforces ${cap} (${capVal})`);
    else if (/^\d+$/.test(tokenMatch[1]) && !/^\d+$/.test(cap)) report(path, i + 1, `rule 2: '${field}' [maxLength] is the literal ${tokenMatch[1]} — bind the ${cap} member so they cannot drift`);
  }
}

// ---------------------------------------------------------------- modals (rule 4)
/**
 * Modals that take input but are not edit dialogs, so a save banner would be wrong. Every entry
 * needs a reason. The list only shrinks: an entry whose file is gone or no longer trips the rule
 * is reported as stale. Adding an entry is a design decision — not a way to silence the check.
 */
const MODAL_ALLOWLIST = {
  'libs/shared/ui/src/lib/date-time-select.modal.ts': 'picker: date (+ optional time), confirmed by OK',
  'libs/shared/ui/src/lib/date-picker.modal.ts': 'picker: ion-datetime calendar',
  'libs/shared/ui/src/lib/date-select.modal.ts': 'picker: ion-datetime calendar',
  'libs/shared/ui/src/lib/time-select.modal.ts': 'picker: ion-datetime time wheel',
  'libs/shared/ui/src/lib/duration-picker.modal.ts': 'picker: ion-datetime duration wheels',
  'libs/tenant/ui/src/lib/block-enable.modal.ts': 'confirmation: choose which menu rows to attach when enabling a feature block',
  'libs/aoc/feature/src/lib/tenant-allocation-confirm.modal.ts': 'consent dialog: confirm a tenant allocation (spec 1.47)',
  'libs/content/document/feature/src/lib/vectorize.modal.ts': 'tool: tune and re-run an SVG trace',
  'libs/finance/expense/feature/src/lib/expense-detail.modal.ts': 'read-only view: renders the edit form in readOnly mode, nothing to save',
  'libs/auth/feature/src/lib/login.modal.ts': 'auth form with its own submit, nothing is edited',
  'libs/shared/ui/src/lib/distribution-list.modal.ts': 'picker: choose recipients for the email composer',
  'libs/calevent/ui/src/lib/regression-selection.modal.ts': 'picker: scope of a series change (this / future / all)',
  'libs/calevent/ui/src/lib/organiser-contact.modal.ts': 'action picker: whom to contact and how',
  'libs/calevent/ui/src/lib/calendar-sync.modal.ts': 'tool: shows / copies / resets a subscription link',
  'libs/vcard/feature/src/lib/vcard-import-review.modal.ts': 'wizard step: review parsed cards before import',
  'libs/vcard/feature/src/lib/vcard-export-scope.modal.ts': 'picker: export scope toggles',
  'libs/profile/feature/src/lib/data-erasure.modal.ts': 'destructive confirmation: type-to-confirm erasure',
  'libs/forms/feature/src/lib/decrypt-files.modal.ts': 'tool: password to decrypt files, nothing is saved',
  'libs/forms/feature/src/lib/section-encryption-setup.modal.ts': 'confirmation: shows a generated password, acknowledge to activate',
  'libs/cms/section/feature/src/lib/message-center.modal.ts': 'tool: composes and sends messages',
  'libs/content/esign/feature/src/lib/esign-send-document.modal.ts': 'wizard: upload, assign signees, send',
};

const RAW_INPUT = /<ion-(input|textarea|select|checkbox|toggle|radio-group|range|datetime)\b/;
// [(ngModel)] on a segment or searchbar is navigation / filtering, not data entry
const NG_MODEL = /<ion-(?!segment|searchbar)[a-z-]+[^>]*\[\(ngModel\)\]|^\s*\[\(ngModel\)\]/;
const modalHits = new Map();
for (const path of execSync(`find libs apps -name '*.modal.ts' -not -path '*/node_modules/*' -not -path 'apps/*/node_modules/*'`, { encoding: 'utf8' })
  .split('\n').filter(Boolean).sort()) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const src = lines.join('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (RAW_INPUT.test(line)) hits.push([i + 1, `raw ${line.match(RAW_INPUT)[0]}> in a modal — move the field into an okr-*-form built from shared/ui primitives`]);
    else if (NG_MODEL.test(line)) hits.push([i + 1, '[(ngModel)] in a modal — edit through a form component (formData + onFieldChange)']);
  });
  if (/<okr-[a-z-]+-form\b/.test(src) && !src.includes('okr-change-confirmation'))
    hits.push([1, 'renders a form but no okr-change-confirmation — the parent drives saving through the banner']);
  if (hits.length) modalHits.set(path, hits);
}
for (const [path, hits] of modalHits) {
  if (path in MODAL_ALLOWLIST) continue;
  for (const [line, msg] of hits) report(path, line, `rule 4: ${msg}`);
}
for (const path of Object.keys(MODAL_ALLOWLIST)) {
  if (!modalHits.has(path)) report(path, 1, 'rule 4: stale MODAL_ALLOWLIST entry (file gone or now compliant) — remove it');
}

if (findings.length) {
  console.error(`check-forms: ${findings.length} finding(s)\n`);
  for (const f of findings) console.error('  ' + f);
  console.error('\nSee the `building-forms` skill: "The three length rules", "Per-field error notes are mandatory" and "The parent (edit modal or page)".');
  process.exit(1);
}
console.log('check-forms: ok');
