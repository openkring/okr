import { lexVcards, splitStructured } from './vcard-lexer';
import { VcardProperty } from './vcard-import-types';
import { VcardChannel, VcardEmployment, VcardRecord, VcardRelatedName, VcardTargetKind } from './vcard-types';

/**
 * vCard parser — the inverse of `vcard-generator.ts`. Turns the per-card property
 * lists produced by `lexVcards` into a `ParsedVcard`, the same shape the exporter
 * emits (`VcardRecord`) plus import bookkeeping (residual/notes/warnings).
 *
 * Pure, dependency-free. Firestore-model mapping happens downstream (Task 3+).
 */

export interface ParsedVcard extends VcardRecord {
  sourceFileName: string;
  /** raw DEATHDATE/X-DEATH-DATE value, import-only — VcardRecord (export) has no death date. */
  deathdate?: string;
  /** properties no mapping consumed — input to the notes block (§4.6) */
  residual: VcardProperty[];
  /** NOTE values, unescaped, in source order */
  noteTexts: string[];
  warnings: string[];
}

/**
 * Property names the parser understands and therefore never puts into `residual`.
 * `BEGIN`/`END` never reach us as properties and `VERSION` is filtered out by the
 * lexer already, but they are listed here for documentation completeness.
 */
export const CONSUMED_PROPERTIES: ReadonlySet<string> = new Set([
  'BEGIN', 'END', 'VERSION', 'PRODID', 'REV', 'UID',
  'N', 'FN', 'ORG', 'TITLE', 'ROLE',
  'TEL', 'EMAIL', 'ADR', 'LABEL', 'URL',
  'BDAY', 'DEATHDATE', 'X-DEATH-DATE',
  'PHOTO', 'LOGO',
  'NOTE',
  'X-ABSHOWAS', 'X-ABLABEL', 'X-ABRELATEDNAMES', 'RELATED',
]);

const TYPE_TOKENS_TO_SKIP = new Set(['PREF', 'VOICE', 'INTERNET', 'PREF=1']);

/** Remove keys whose value is `undefined`, so `toEqual` comparisons see only real data. */
function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function findProp(props: VcardProperty[], name: string): VcardProperty | undefined {
  return props.find((p) => p.name.toUpperCase() === name);
}

function findProps(props: VcardProperty[], name: string): VcardProperty[] {
  return props.filter((p) => p.name.toUpperCase() === name);
}

function isBlankParts(parts: string[]): boolean {
  return parts.every((p) => p.trim().length === 0);
}

/** first TYPE value that isn't a pref/voice/internet marker; `pref` from TYPE=PREF or a bare PREF param. */
function typeAndPref(p: VcardProperty): { type?: string; pref: boolean } {
  const typeValues = p.params['TYPE'] ?? [];
  const type = typeValues.find((t) => !TYPE_TOKENS_TO_SKIP.has(t.toUpperCase()));
  const pref = typeValues.some((t) => t.toUpperCase() === 'PREF') || p.params['PREF'] !== undefined;
  return { type, pref };
}

/** Map of item-group id → its `X-ABLabel` value, for web channels and related names. */
function buildAbLabelsByGroup(props: VcardProperty[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of props) {
    if (p.name.toUpperCase() === 'X-ABLABEL' && p.group) {
      map.set(p.group, p.value);
    }
  }
  return map;
}

function parseChannels(props: VcardProperty[], abLabelsByGroup: Map<string, string>): VcardChannel[] {
  const channels: VcardChannel[] = [];
  for (const p of props) {
    const name = p.name.toUpperCase();
    if (name === 'TEL') {
      const { type, pref } = typeAndPref(p);
      channels.push(compact<VcardChannel>({ channel: 'phone', type, pref: pref || undefined, value: p.value }));
    } else if (name === 'EMAIL') {
      const { type, pref } = typeAndPref(p);
      channels.push(compact<VcardChannel>({ channel: 'email', type, pref: pref || undefined, value: p.value }));
    } else if (name === 'URL') {
      const { type, pref } = typeAndPref(p);
      const label = p.group ? abLabelsByGroup.get(p.group) : undefined;
      channels.push(compact<VcardChannel>({ channel: 'web', type, pref: pref || undefined, value: p.value, label }));
    } else if (name === 'ADR') {
      const { type, pref } = typeAndPref(p);
      const parts = splitStructured(p.rawValue);
      channels.push(
        compact<VcardChannel>({
          channel: 'postal',
          type,
          pref: pref || undefined,
          street: parts[2] || undefined,
          city: parts[3] || undefined,
          region: parts[4] || undefined,
          zip: parts[5] || undefined,
          country: parts[6] || undefined,
        }),
      );
    }
    // LABEL is consumed and ignored — it duplicates ADR.
  }
  return channels;
}

function parseRelatedNames(props: VcardProperty[], abLabelsByGroup: Map<string, string>): VcardRelatedName[] {
  const relatedNames: VcardRelatedName[] = [];
  for (const p of props) {
    const name = p.name.toUpperCase();
    if (name === 'X-ABRELATEDNAMES') {
      const label = (p.group ? abLabelsByGroup.get(p.group) : undefined) ?? '';
      relatedNames.push({ name: p.value, label });
    } else if (name === 'RELATED') {
      const label = p.params['TYPE']?.[0] ?? '';
      relatedNames.push({ name: p.value, label });
    }
  }
  return relatedNames;
}

function parseEmployment(props: VcardProperty[], kind: VcardTargetKind, orgProp: VcardProperty | undefined): VcardEmployment | undefined {
  if (kind !== 'person' || !orgProp) return undefined;
  const parts = splitStructured(orgProp.rawValue);
  const titleProp = findProp(props, 'TITLE');
  const roleProp = findProp(props, 'ROLE');
  return compact<VcardEmployment>({
    org: parts[0] ?? '',
    department: parts[1] || undefined,
    title: titleProp?.value,
    role: roleProp?.value,
  });
}

function parsePhoto(props: VcardProperty[], kind: VcardTargetKind, warnings: string[]): string | undefined {
  const propName = kind === 'org' ? 'LOGO' : 'PHOTO';
  const photoProp = findProp(props, propName);
  if (!photoProp) return undefined;
  const encodings = (photoProp.params['ENCODING'] ?? []).map((v) => v.toUpperCase());
  const hasBase64Encoding = encodings.includes('B') || encodings.includes('BASE64');
  if (hasBase64Encoding) {
    return photoProp.value;
  }
  const isUriValue = (photoProp.params['VALUE'] ?? []).some((v) => v.toUpperCase() === 'URI');
  if (isUriValue) {
    warnings.push(`${propName} is a VALUE=uri reference, not inline data — skipped`);
  }
  return undefined;
}

/** Parse one lexed vCard block into a `ParsedVcard`, or `undefined` when it has no usable name. */
function parseBlock(props: VcardProperty[], sourceFileName: string): ParsedVcard | undefined {
  const nProp = findProp(props, 'N');
  const fnProp = findProp(props, 'FN');
  const orgProp = findProp(props, 'ORG');
  const nParts = nProp ? splitStructured(nProp.rawValue) : [];
  const nBlank = !nProp || isBlankParts(nParts);

  const isCompany = findProps(props, 'X-ABSHOWAS').some((p) => p.value.trim().toUpperCase() === 'COMPANY');
  const kind: VcardTargetKind = isCompany || (nBlank && !!orgProp) ? 'org' : 'person';

  let firstName: string | undefined;
  let lastName: string | undefined;
  let orgName: string | undefined;
  let displayName: string | undefined;

  if (kind === 'org') {
    orgName = orgProp ? splitStructured(orgProp.rawValue)[0] || undefined : undefined;
    displayName = fnProp?.value || orgName;
  } else {
    if (nProp && !nBlank) {
      lastName = nParts[0] || undefined;
      firstName = nParts[1] || undefined;
    } else if (fnProp?.value) {
      const tokens = fnProp.value.trim().split(/\s+/);
      lastName = tokens.at(-1);
      firstName = tokens.slice(0, -1).join(' ') || undefined;
    }
    displayName = fnProp?.value || `${firstName ?? ''} ${lastName ?? ''}`.trim();
  }

  const nameProduced = kind === 'org' ? !!displayName : !!(firstName || lastName);
  if (!nameProduced) return undefined;

  const abLabelsByGroup = buildAbLabelsByGroup(props);
  const warnings: string[] = [];

  return {
    kind,
    firstName,
    lastName,
    displayName: displayName as string,
    orgName,
    bday: findProp(props, 'BDAY')?.value,
    deathdate: findProp(props, 'DEATHDATE')?.value ?? findProp(props, 'X-DEATH-DATE')?.value,
    photoBase64: parsePhoto(props, kind, warnings),
    channels: parseChannels(props, abLabelsByGroup),
    employment: parseEmployment(props, kind, orgProp),
    relatedNames: parseRelatedNames(props, abLabelsByGroup),
    sourceFileName,
    residual: props.filter((p) => !CONSUMED_PROPERTIES.has(p.name.toUpperCase())),
    noteTexts: findProps(props, 'NOTE').map((p) => p.value),
    warnings,
  };
}

/** Parse a whole `.vcf` file into `ParsedVcard`s, dropping any card with neither `N` nor `FN`. */
export function parseVcards(text: string, sourceFileName: string): ParsedVcard[] {
  const blocks = lexVcards(text);
  const result: ParsedVcard[] = [];
  for (const props of blocks) {
    const parsed = parseBlock(props, sourceFileName);
    if (parsed) result.push(parsed);
  }
  return result;
}
