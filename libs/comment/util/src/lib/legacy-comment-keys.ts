const PFX_UI = '@comment/ui.';

/**
 * Comment descriptions are stored in the database, so keys written by older releases survive every
 * refactoring. Until 2026-05 the app wrote i18n keys such as '@comment.operation.initial.conf' into
 * `comments.description`; today it resolves the text before writing. Those legacy tokens carry no
 * scope ('comment' has no '/'), so I18nService looks them up in the main bundle, where the `comment`
 * entry is a plain string — every such row reports a missing key to Sentry and shows the user the
 * raw token instead of a text.
 *
 * Comments are immutable by design, so the stored documents are not rewritten: the read path maps
 * the old token onto the current scoped key instead.
 */
const LEGACY_COMMENT_KEYS: Record<string, string> = {
  '@comment.operation.initial.conf': PFX_UI + 'legacy.created',
  '@comment.operation.update.conf': PFX_UI + 'legacy.changed',
  '@comment.message.membership.deleted': PFX_UI + 'legacy.deleted',
  '@comment.message.ownership.deleted': PFX_UI + 'legacy.deleted',
  '@comment.message.personalRel.deleted': PFX_UI + 'legacy.deleted',
  '@comment.message.reservation.deleted': PFX_UI + 'legacy.deleted',
  '@comment.message.workingRel.deleted': PFX_UI + 'legacy.deleted'
};

/**
 * Map a legacy comment key onto its current equivalent. Any other value — a current scoped key or
 * plain user text — is returned unchanged.
 * @param key the leading token of a stored comment description, e.g. '@comment.operation.initial.conf'
 */
export function resolveLegacyCommentKey(key: string): string {
  return LEGACY_COMMENT_KEYS[key] ?? key;
}
