/**
 * Dynamic tokens that may appear in a menu item's `label` and are expanded at render time.
 *
 * Adding a new token is a one-file change: add a field to {@link MenuTokenContext} (the data
 * the resolver needs) and an entry to {@link MENU_TOKENS}. See MENU.md for the documented list.
 */
export interface MenuTokenContext {
  /** Current app version, e.g. '4.2.0'. */
  version: string;
  /**
   * Base URL of the git repository this app is built from, e.g. 'https://github.com/openkring/okr'
   * (no trailing slash), derived from `app-config`'s `gitOrg`/`gitRepo`. Optional because label
   * expansion has no use for it; url expansion always passes it.
   */
  repoUrl?: string;
}

/** Registry of supported tokens → resolver. Keys are the literal tokens found in labels. */
export const MENU_TOKENS: Record<string, (ctx: MenuTokenContext) => string> = {
  '@VERSION@': (ctx) => 'v' + ctx.version,
  // Used in a `browse` item's URL, not in a label: '@REPO_URL@/commits/main/'. Keeping the
  // repository out of the menu document means a repo move is one app-config edit, not a hunt
  // through every tenant's menu docs (which is exactly how the bk2 → openkring/okr rename
  // left the shared `version` item pointing at a dead repo).
  '@REPO_URL@': (ctx) => ctx.repoUrl ?? ''
  // future: '@TENANT_NAME@', '@USER_NAME@', ...
};

/**
 * Expands every known token in `label`. Unknown tokens and token-free labels are returned
 * unchanged. Pure and synchronous so it is trivially testable.
 */
export function expandMenuTokens(label: string, ctx: MenuTokenContext): string {
  let result = label;
  for (const [token, resolve] of Object.entries(MENU_TOKENS)) {
    if (result.includes(token)) {
      result = result.split(token).join(resolve(ctx));
    }
  }
  return result;
}

/**
 * Turns a menu item's stored `label` into the key to hand to `I18nService.translate()`:
 * expands dynamic tokens, and prefixes bare `@key` labels with the menu scope. A label that
 * already carries its own scope (`@domain/layer.key` — the segment before the first dot
 * contains a `/`, the same test I18nService uses) is left alone; double-scoping it produced
 * misses like `@cms/menu/feature.system/workflow/feature.plural`.
 */
export function resolveMenuLabelKey(label: string, ctx: MenuTokenContext): string {
  const expanded = expandMenuTokens(label, ctx);
  if (expanded !== label) return expanded;  // a dynamic token (e.g. @VERSION@) was expanded
  if (!label.startsWith('@')) return label;
  const body = label.substring(1);
  const head = body.split('.', 1)[0];
  return head.includes('/') ? label : '@cms/menu/feature.' + body;
}

/**
 * Builds the '@REPO_URL@' value from an app-config's git coordinates. Returns '' when either
 * is missing, so an unexpanded token never produces a half-formed 'https://github.com//'.
 */
export function getRepoUrl(gitOrg?: string, gitRepo?: string): string {
  if (!gitOrg || !gitRepo) return '';
  return `https://github.com/${gitOrg}/${gitRepo}`;
}

/**
 * Expands the dynamic tokens in a menu item's `url`. Unlike a label, a url is never an i18n
 * key, so this is plain token substitution.
 */
export function resolveMenuUrl(url: string, ctx: MenuTokenContext): string {
  return expandMenuTokens(url, ctx);
}
