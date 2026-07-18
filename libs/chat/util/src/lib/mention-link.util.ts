const MATRIX_TO_MENTION_PREFIX = 'https://matrix.to/#/@';

/**
 * Extract the (lowercased) localpart of a Matrix user id from a `matrix.to` mention
 * anchor href, e.g. `https://matrix.to/#/@p1:example.org` → `p1`. This is the same
 * derivation `MatrixChatService.getRoomMemberPersonKeys` uses (`userId.slice(1).split(':')[0]`),
 * applied to the anchor `buildMentionContent` emits in `formatted_body`.
 *
 * Returns undefined for anything that is not a matrix.to person-mention link — room
 * links, ordinary http(s) links pasted into a message, etc. — so callers can leave
 * those anchors untouched.
 */
export function extractMentionLocalpart(href: string): string | undefined {
  if (!href.startsWith(MATRIX_TO_MENTION_PREFIX)) return undefined;
  const userId = href.split('/#/')[1];
  if (!userId?.startsWith('@')) return undefined;
  const localpart = userId.slice(1).split(':')[0];
  return localpart || undefined;
}
