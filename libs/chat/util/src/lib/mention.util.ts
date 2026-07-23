/** A person mention as tracked by the chat input (before homeserver resolution). */
export interface MentionRef {
  /** PersonModel.okey */
  personKey: string;
  /** 'First Last' as inserted into the message text */
  display: string;
}

/** A person mention resolved to a full Matrix user id (done in data-access). */
export interface ResolvedMention {
  display: string;
  /** full Matrix user id, e.g. '@p1:example.org' */
  userId: string;
}

/** What MatrixMessageInput emits on send. */
export interface MessageDraft {
  text: string;
  mentions: MentionRef[];
  mentionRoom: boolean;
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

/**
 * Build the Matrix `m.mentions` block and — when there are person mentions — the
 * `formatted_body` HTML. Returns null when there is nothing to mention, so the caller
 * sends a plain text message unchanged.
 */
export function buildMentionContent(
  text: string,
  mentions: ResolvedMention[],
  mentionRoom: boolean,
): { formatted_body?: string; mentions: { user_ids: string[]; room?: boolean } } | null {
  const userIds = [...new Set(mentions.map((m) => m.userId))];
  if (userIds.length === 0 && !mentionRoom) return null;

  const mMentions: { user_ids: string[]; room?: boolean } = { user_ids: userIds };
  if (mentionRoom) mMentions.room = true;

  if (mentions.length === 0) {
    return { mentions: mMentions };
  }

  let html = escapeHtml(text);
  // Known limitation: replacement is per-mention first-remaining-occurrence, so if one
  // @display is a literal prefix of another (e.g. "Al" vs "Alan") the shorter, processed
  // first, can match inside the longer. Acceptable for "First Last" display names.
  for (const mention of mentions) {
    const needle = escapeHtml('@' + mention.display);
    const anchor = `<a href="https://matrix.to/#/${escapeHtml(mention.userId)}">${escapeHtml(mention.display)}</a>`;
    html = html.replace(needle, anchor); // first remaining occurrence only
  }
  return { formatted_body: html, mentions: mMentions };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keep only the mentions whose `@display` still occurs in the text, matched up to a word
 * boundary so a display name that is a literal prefix of another ("Al Meier" vs
 * "Al Meiers") does not match the longer one. Deduplicated by personKey.
 */
export function filterActiveMentions(text: string, mentions: MentionRef[]): MentionRef[] {
  const seen = new Set<string>();
  const active: MentionRef[] = [];
  for (const mention of mentions) {
    if (seen.has(mention.personKey)) continue;
    // '-' is in the lookahead too: without it a mention for "Anna Meier" would falsely match
    // inside "@Anna Meier-Muster" (hyphenated surnames are common here).
    const pattern = new RegExp(`@${escapeRegExp(mention.display)}(?![\\p{L}\\p{N}-])`, 'u');
    if (!pattern.test(text)) continue;
    seen.add(mention.personKey);
    active.push(mention);
  }
  return active;
}
