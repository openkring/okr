/**
 * Pure parts of scripts/migrate-family-households.ts (spec 1.168 §5.1): CSV, address grouping, line validation.
 * No I/O, no personal data. Tested by migrate-family-households.test.mjs (`node --test`).
 */

export const CSV_HEADER = ['household', 'personKey', 'firstName', 'lastName', 'payer', 'contact'];

/** Street + number + zip, trimmed, whitespace collapsed, case ignored. '' when street or zip is missing. */
export function addressKey(a) {
  if (!a) return '';
  const n = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const street = n(a.streetName);
  const zip = n(a.zipCode);
  if (street === '' || zip === '') return '';
  return `${street}|${n(a.streetNumber)}|${zip}`;
}

/** Groups rows ({personKey, key}) by address key; rows without a key are returned as `unplaced`. */
export function groupByAddress(rows) {
  const groups = new Map();
  const unplaced = [];
  for (const r of rows) {
    if (!r.key) {
      unplaced.push(r);
      continue;
    }
    if (!groups.has(r.key)) groups.set(r.key, []);
    groups.get(r.key).push(r);
  }
  return { groups: [...groups.values()], unplaced };
}

function escapeCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) lines.push(CSV_HEADER.map((c) => escapeCell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

/** RFC-4180-ish parser: quoted cells, doubled quotes, CRLF. Returns rows as arrays of cells (blank lines skipped). */
export function parseCsvCells(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') endRow();
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

/** Parses the CSV into row objects keyed by header; throws on a wrong header. */
export function parseCsv(text) {
  const cells = parseCsvCells(text.replace(/^﻿/, ''));
  if (cells.length === 0) throw new Error('empty CSV');
  const header = cells[0].map((h) => h.trim());
  if (header.join(',') !== CSV_HEADER.join(',')) throw new Error(`header must be ${CSV_HEADER.join(',')}`);
  return cells.slice(1).map((c, i) => ({
    line: i + 2,
    ...Object.fromEntries(CSV_HEADER.map((h, j) => [h, (c[j] ?? '').trim()])),
  }));
}

const isMark = (v) => String(v ?? '').trim().toLowerCase() === 'x';

/**
 * Rows with the same `household` form one household (that value is its name). A household is refused
 * (all its lines, with the reason) when: no name or personKey on a line, no contact, two payers, two contacts,
 * a duplicate person, or fewer than two members. Payer is '' when none is marked (invoice per person).
 * Returns { households: [{name, memberKeys, payerKey, contactKey, lines}], refused: [{household, lines, reason}] }.
 */
export function validateRows(rows) {
  const byName = new Map();
  const refused = [];
  for (const r of rows) {
    if (!r.household || !r.personKey) {
      refused.push({ household: r.household ?? '', lines: [r.line], reason: 'missing household or personKey' });
      continue;
    }
    if (!byName.has(r.household)) byName.set(r.household, []);
    byName.get(r.household).push(r);
  }
  const households = [];
  for (const [name, group] of byName) {
    const lines = group.map((g) => g.line);
    const memberKeys = group.map((g) => g.personKey);
    const payers = group.filter((g) => isMark(g.payer));
    const contacts = group.filter((g) => isMark(g.contact));
    let reason;
    if (new Set(memberKeys).size !== memberKeys.length) reason = 'duplicate person';
    else if (memberKeys.length < 2) reason = 'fewer than two members';
    else if (contacts.length === 0) reason = 'no contact';
    else if (contacts.length > 1) reason = 'two contacts';
    else if (payers.length > 1) reason = 'two payers';
    if (reason) refused.push({ household: name, lines, reason });
    else households.push({ name, memberKeys, payerKey: payers[0]?.personKey ?? '', contactKey: contacts[0].personKey, lines });
  }
  return { households, refused };
}

/** Chunks of at most n. */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
