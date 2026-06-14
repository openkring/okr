/**
 * Dynamic tokens that may appear in a menu item's `label` and are expanded at render time.
 *
 * Adding a new token is a one-file change: add a field to {@link MenuTokenContext} (the data
 * the resolver needs) and an entry to {@link MENU_TOKENS}. See MENU.md for the documented list.
 */
export interface MenuTokenContext {
  /** Current app version, e.g. '4.2.0'. */
  version: string;
}

/** Registry of supported tokens → resolver. Keys are the literal tokens found in labels. */
export const MENU_TOKENS: Record<string, (ctx: MenuTokenContext) => string> = {
  '@VERSION@': (ctx) => 'v' + ctx.version
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
