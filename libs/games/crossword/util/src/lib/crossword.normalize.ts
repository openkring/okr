import { CrosswordEntry } from '@okr/shared-models';

export const MIN_ANSWER_LENGTH = 3;
export const MAX_ANSWER_LENGTH = 20;

export interface NormalizedEntry {
  index: number;   // index into the original entries[]
  answer: string;  // grid form: A-Z only
  clue: string;
  raw: string;     // what the admin typed, for the clue list
}

export type RejectReason = 'too-short' | 'too-long' | 'duplicate' | 'empty-clue';

export interface RejectedEntry {
  index: number;
  reason: RejectReason;
}

/** Umlauts expand to two characters — the German crossword convention, one letter per cell. */
const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/Ä/g, 'AE'], [/Ö/g, 'OE'], [/Ü/g, 'UE'], [/ß/g, 'SS'],
];

/**
 * The grid form of an answer: uppercase, umlauts expanded, accents folded, everything outside
 * A-Z dropped. Returns '' when nothing survives — the caller treats that as too short.
 */
export function normalizeAnswer(raw: string): string {
  let out = raw.toUpperCase();
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // fold remaining accents (É → E) before dropping the rest
  out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return out.replace(/[^A-Z]/g, '');
}

/**
 * Split the admin's entries into the ones the generator may place and the ones it must not.
 * Order is preserved; the first spelling of a duplicate wins.
 */
export function normalizeEntries(entries: CrosswordEntry[]): { usable: NormalizedEntry[]; rejected: RejectedEntry[] } {
  const usable: NormalizedEntry[] = [];
  const rejected: RejectedEntry[] = [];
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    const answer = normalizeAnswer(entry.answer);
    if (answer.length < MIN_ANSWER_LENGTH) { rejected.push({ index, reason: 'too-short' }); return; }
    if (answer.length > MAX_ANSWER_LENGTH) { rejected.push({ index, reason: 'too-long' }); return; }
    if (seen.has(answer))                  { rejected.push({ index, reason: 'duplicate' }); return; }
    if (entry.clue.trim() === '')          { rejected.push({ index, reason: 'empty-clue' }); return; }
    seen.add(answer);
    usable.push({ index, answer, clue: entry.clue, raw: entry.answer });
  });

  return { usable, rejected };
}
