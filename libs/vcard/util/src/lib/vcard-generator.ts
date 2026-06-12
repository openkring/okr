import { ExportScope, VcardChannel, VcardRecord } from './vcard-types';

/**
 * vCard 3.0 generator (RFC 2426), tuned for Apple Contacts import (spec §2):
 * - emits VERSION:3.0 and UTF-8 content with CRLF line endings;
 * - folds logical lines longer than 75 octets;
 * - escapes `\` `,` `;` and newlines in property values;
 * - uses Apple `X-AB*` extensions for relationships / custom labels.
 *
 * Photo bytes and the country display name are assembled upstream (server-side);
 * this module stays pure and dependency-free.
 */

const CRLF = '\r\n';

/** Escape a vCard property *value* per RFC 2426 §5 (backslash first). */
export function escapeVcardValue(value: string | undefined): string {
  return (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Fold one logical line into physical lines ≤ 75 octets, splitting on UTF-8
 * character boundaries. Continuation lines begin with a single space.
 */
export function foldVcardLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  let isFirst = true;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    // continuation lines reserve 1 octet for the leading space
    const limit = isFirst ? 75 : 74;
    if (currentBytes + chBytes > limit && current.length > 0) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
      isFirst = false;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  out.push(current);
  return out.join(CRLF + ' ');
}

function typeTokens(...tokens: (string | undefined | false)[]): string {
  return tokens.filter((t): t is string => !!t).join(',');
}

function emitChannel(lines: string[], ch: VcardChannel, itemCounter: { n: number }): void {
  switch (ch.channel) {
    case 'phone':
      lines.push(`TEL;TYPE=${typeTokens(ch.type, 'VOICE', ch.pref && 'PREF')}:${escapeVcardValue(ch.value)}`);
      break;
    case 'email':
      lines.push(`EMAIL;TYPE=${typeTokens(ch.type, 'INTERNET', ch.pref && 'PREF')}:${escapeVcardValue(ch.value)}`);
      break;
    case 'postal': {
      const type = typeTokens(ch.type, ch.pref && 'PREF');
      const typeParam = type ? `;TYPE=${type}` : '';
      // ADR field order: ;PO;Ext;Street;Locality;Region;PostalCode;Country
      const adr = [
        '',
        '',
        escapeVcardValue(ch.street),
        escapeVcardValue(ch.city),
        escapeVcardValue(ch.region),
        escapeVcardValue(ch.zip),
        escapeVcardValue(ch.country),
      ].join(';');
      lines.push(`ADR${typeParam}:${adr}`);
      const labelText = [ch.street, `${ch.zip ?? ''} ${ch.city ?? ''}`.trim(), ch.country].filter((p) => !!p && p.length > 0).join('\n');
      lines.push(`LABEL${typeParam}:${escapeVcardValue(labelText)}`);
      break;
    }
    case 'web':
      if (ch.label && ch.label.length > 0) {
        const item = `item${itemCounter.n++}`;
        lines.push(`${item}.URL:${escapeVcardValue(ch.value)}`);
        lines.push(`${item}.X-ABLabel:${escapeVcardValue(ch.label)}`);
      } else {
        lines.push(`URL:${escapeVcardValue(ch.value)}`);
      }
      break;
  }
}

/**
 * Build a single `BEGIN:VCARD … END:VCARD` block (3.0) for an assembled record.
 * `scope` is honoured as a secondary guard; the server already assembled `record`
 * to the allowed scope.
 */
export function buildVCard(record: VcardRecord, scope: ExportScope): string {
  const lines: string[] = [];
  const itemCounter = { n: 1 };

  lines.push('BEGIN:VCARD');
  lines.push('VERSION:3.0');

  if (record.kind === 'org') {
    // Apple renders a company card when N is empty and X-ABShowAs:COMPANY is present.
    lines.push('N:;;;;');
    lines.push(`FN:${escapeVcardValue(record.displayName)}`);
    lines.push(`ORG:${escapeVcardValue(record.orgName ?? record.displayName)}`);
    lines.push('X-ABShowAs:COMPANY');
  } else {
    lines.push(`N:${escapeVcardValue(record.lastName)};${escapeVcardValue(record.firstName)};;;`);
    lines.push(`FN:${escapeVcardValue(record.displayName)}`);
    if (scope.workRels && record.employment) {
      const e = record.employment;
      lines.push(`ORG:${escapeVcardValue(e.org)}${e.department ? ';' + escapeVcardValue(e.department) : ''}`);
      if (e.title) lines.push(`TITLE:${escapeVcardValue(e.title)}`);
      if (e.role) lines.push(`ROLE:${escapeVcardValue(e.role)}`);
    }
  }

  if (scope.birthday && record.bday) {
    lines.push(`BDAY:${record.bday}`);
  }

  for (const ch of record.channels) {
    if (!scope.addresses.includes(ch.channel)) continue;
    emitChannel(lines, ch, itemCounter);
  }

  // Item-grouped related names (PersonalRels, extra employers, org-linked persons).
  // The server already filtered these by scope, so emit whatever is present.
  for (const rel of record.relatedNames) {
    const item = `item${itemCounter.n++}`;
    lines.push(`${item}.X-ABRELATEDNAMES:${escapeVcardValue(rel.name)}`);
    lines.push(`${item}.X-ABLabel:${escapeVcardValue(rel.label)}`);
  }

  if (scope.photo && record.photoBase64) {
    lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${record.photoBase64}`);
  }

  lines.push('END:VCARD');

  return lines.map(foldVcardLine).join(CRLF) + CRLF;
}

/**
 * Concatenate multiple cards into one `.vcf` body (tier 3 multi-record export).
 */
export function buildVCardFile(records: VcardRecord[], scope: ExportScope): string {
  return records.map((r) => buildVCard(r, scope)).join('');
}

/** Apple predefined relationship labels keyed by a normalized relation kind. */
const APPLE_RELATION_LABELS: Record<string, string> = {
  spouse: '_$!<Spouse>!$_',
  marriage: '_$!<Spouse>!$_',
  partner: '_$!<Partner>!$_',
  child: '_$!<Child>!$_',
  parent: '_$!<Parent>!$_',
  mother: '_$!<Mother>!$_',
  father: '_$!<Father>!$_',
  brother: '_$!<Brother>!$_',
  sister: '_$!<Sister>!$_',
  sibling: '_$!<Sister>!$_',
  friend: '_$!<Friend>!$_',
  friendship: '_$!<Friend>!$_',
  assistant: '_$!<Assistant>!$_',
  manager: '_$!<Manager>!$_',
};

/**
 * Map a relation kind to Apple's predefined label where one exists; otherwise
 * fall back to a provided custom label or the raw kind (spec §3.5).
 */
export function toAppleRelationLabel(relationKind: string | undefined, customLabel?: string): string {
  const key = (relationKind ?? '').trim().toLowerCase();
  const predefined = APPLE_RELATION_LABELS[key];
  if (predefined) return predefined;
  if (customLabel && customLabel.trim().length > 0) return customLabel.trim();
  return relationKind && relationKind.trim().length > 0 ? relationKind.trim() : 'Contact';
}
