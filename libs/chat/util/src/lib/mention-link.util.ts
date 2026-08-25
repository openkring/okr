import { escapeHtml } from './mention.util';

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

/**
 * Rewrite the person-mention anchors of a `formatted_body` into compact pills: the person's
 * avatar followed by their FIRST name only. The wire format is left alone — `buildMentionContent`
 * keeps emitting the full "First Last" label, so other Matrix clients and push notifications
 * still show the unambiguous name; only our own rendering is shortened.
 *
 * `avatarUrlFor` receives the anchor's Matrix localpart (which IS the `PersonModel.okey`) and
 * returns a thumbnail URL, or undefined when none is cached — in that case the pill renders as
 * text only rather than falling back to a generic icon.
 *
 * Only `matrix.to` person anchors are touched (`extractMentionLocalpart` returns undefined for
 * anything else), so room links and ordinary pasted links pass through verbatim. The anchor
 * label is already HTML-escaped by `buildMentionContent`, so it is reused as-is; the avatar URL
 * is escaped here because it comes from outside the html string.
 *
 * Note the img/class markup must survive Angular's `[innerHTML]` sanitizer — `img`, `src`,
 * `alt` and `class` are all on its allow-list, `style` is NOT, so the pill is styled by class
 * (see the `::ng-deep .okr-mention-pill` rules in `matrix-message-list`).
 */
export function decorateMentionPills(
  html: string,
  avatarUrlFor: (localpart: string) => string | undefined,
): string {
  return html.replace(
    /<a\s+href="([^"]*)"[^>]*>([^<]*)<\/a>/g,
    (match, href: string, label: string) => {
      const localpart = extractMentionLocalpart(href);
      if (!localpart) return match;
      const firstName = label.trim().split(/\s+/)[0] ?? label;
      const avatarUrl = avatarUrlFor(localpart);
      const avatar = avatarUrl
        ? `<img class="okr-mention-avatar" src="${escapeHtml(avatarUrl)}" alt="" />`
        : '';
      return `<a href="${href}" class="okr-mention-pill">${avatar}${firstName}</a>`;
    },
  );
}
