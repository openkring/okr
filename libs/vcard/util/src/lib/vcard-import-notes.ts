import { DEFAULT_VCARD_IMPORT_TEXTS, fill, VcardImportTexts } from './vcard-i18n';
import { VcardProperty } from './vcard-import-types';
import { ParsedVcard } from './vcard-parser';

/**
 * The "residual notes" block (spec §4.6, §4.7): NOTE plus every vCard property the
 * importer cannot map, rendered verbatim under a header so nothing silently vanishes
 * on import. Pure, dependency-free.
 */

/** Hard cap on the rendered residual block (not counting the NOTE part). */
export const NOTES_RESIDUAL_LIMIT = 4000;

/**
 * Property names that must never be written into `notes` — notes is not the PII
 * vault (see the privacy-model / address-model skills). Matched case-insensitively
 * against the property name.
 */
export const SENSITIVE_PROPERTY_PATTERN = /ssn|ahv|iban/i;

export interface ImportNotes {
  text: string;
  header: string;
  residualLineCount: number;
  warnings: string[];
}

/**
 * The header line that identifies one import block: source file plus import date (§4.6).
 * The single builder both the composer and the import service use — `appendImportNotes`
 * recognises an already-appended block by exactly this string, so a second definition of
 * the format elsewhere would silently break the "same file, same day" dedupe. The
 * template is threaded in from the app bundle (§9); the German default keeps this pure
 * util callable without an Angular caller.
 */
export function importNotesHeader(sourceFileName: string, importDateViewDate: string, template: string = DEFAULT_VCARD_IMPORT_TEXTS.notesHeader): string {
  return fill(template, { date: importDateViewDate, file: sourceFileName });
}

function isBinaryProperty(p: VcardProperty): boolean {
  const name = p.name.toUpperCase();
  if (name === 'SOUND' || name === 'KEY') return true;
  const encodings = (p.params['ENCODING'] ?? []).map((v) => v.toUpperCase());
  return encodings.includes('B') || encodings.includes('BASE64');
}

/** `;TYPE=a,b;OTHERKEY=c` — TYPE first, remaining keys alphabetically, ENCODING/CHARSET dropped. */
function renderParams(params: Record<string, string[]>): string {
  const keys = Object.keys(params).filter((k) => k !== 'ENCODING' && k !== 'CHARSET');
  keys.sort((a, b) => {
    if (a === 'TYPE') return -1;
    if (b === 'TYPE') return 1;
    return a.localeCompare(b);
  });
  if (keys.length === 0) return '';
  return ';' + keys.map((k) => `${k}=${(params[k] ?? []).join(',')}`).join(';');
}

/** Render one residual property as a line, or `undefined` when it must be dropped (sensitive). */
function renderResidualLine(p: VcardProperty, warnings: string[], texts: VcardImportTexts): string | undefined {
  if (SENSITIVE_PROPERTY_PATTERN.test(p.name)) {
    warnings.push(fill(texts.sensitiveDropped, { property: p.name }));
    return undefined;
  }

  const paramsStr = renderParams(p.params);
  if (isBinaryProperty(p)) {
    const kb = Math.round((p.value.length * 0.75) / 1024);
    return `${p.name}${paramsStr}: ${fill(texts.notesNotImported, { size: kb })}`;
  }
  return `${p.name}${paramsStr}: ${p.value}`;
}

/**
 * Compose the `notes` text for one imported vCard: the `NOTE` value(s) verbatim,
 * followed by a header naming the import date and source file and one line per leftover
 * property (or any caller-supplied extra line, e.g. a rejected BDAY). The header is written
 * whenever the card contributes any text at all, so a re-import can recognise it. The residual block is capped at
 * `NOTES_RESIDUAL_LIMIT` characters; the `NOTE` part is never truncated.
 */
export function composeImportNotes(
  parsed: ParsedVcard,
  importDateViewDate: string,
  extraLines: string[] = [],
  texts: VcardImportTexts = DEFAULT_VCARD_IMPORT_TEXTS,
): ImportNotes {
  const header = importNotesHeader(parsed.sourceFileName, importDateViewDate, texts.notesHeader);
  const warnings: string[] = [];

  const residualLines = parsed.residual
    .map((p) => renderResidualLine(p, warnings, texts))
    .filter((line): line is string => line !== undefined);

  const blockLines = [...extraLines, ...residualLines];
  const notePart = parsed.noteTexts.join('\n\n');

  // The header is emitted whenever the card contributes ANY text, not only when there is a
  // residual block: `appendImportNotes` recognises an already-imported block by the header,
  // so a NOTE-only card without one would be appended again on every re-import (§4.6).
  if (notePart.length === 0 && blockLines.length === 0) {
    return { text: '', header, residualLineCount: 0, warnings };
  }

  let block = [header, ...blockLines].join('\n');
  if (block.length > NOTES_RESIDUAL_LIMIT) {
    block = `${block.slice(0, NOTES_RESIDUAL_LIMIT)}\n${texts.notesTruncated}`;
    warnings.push(fill(texts.notesTruncatedWarning, { limit: NOTES_RESIDUAL_LIMIT }));
  }
  const text = notePart ? `${notePart}\n\n${block}` : block;

  return { text, header, residualLineCount: residualLines.length, warnings };
}

/**
 * Merge freshly composed import notes into an existing `notes` field: append, never
 * replace, and never append the same import block twice (identified by its header).
 */
export function appendImportNotes(existingNotes: string, notes: ImportNotes): string {
  if (!notes.text) return existingNotes;
  if (existingNotes.includes(notes.header)) return existingNotes;
  return [existingNotes, notes.text].filter(Boolean).join('\n\n');
}
