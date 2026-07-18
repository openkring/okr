/** The `@…` token the caret currently sits in. */
export interface MentionQuery {
  /** index of the '@' in the text */
  start: number;
  /** text between '@' and the caret; empty right after typing '@' */
  query: string;
}

/**
 * Find the mention token the caret sits in, scanning backwards from `caret` to the
 * nearest '@'. Returns null when the current word contains no '@', when whitespace is
 * hit first, or when the '@' is not at a word start (so an email address like
 * anna@example.com does not open the autocomplete).
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  if (caret < 1 || caret > text.length) return null;
  for (let i = caret - 1; i >= 0; i--) {
    const char = text[i];
    if (/\s/.test(char)) return null;
    if (char !== '@') continue;
    const before = i === 0 ? ' ' : text[i - 1];
    // Reject only letters/digits: that suppresses email addresses (anna@example.com) while
    // still opening the list after punctuation ("(@anna", "-@anna", "„@anna").
    if (/[\p{L}\p{N}]/u.test(before)) return null;
    return { start: i, query: text.slice(i + 1, caret) };
  }
  return null;
}
