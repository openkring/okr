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
  /**
   * The tenant the app is running as, e.g. 'p13'. Used by '@TID@' in a `navigate` url that
   * points at a per-tenant record rather than a page — `/album/@TID@-album/c-album` is one
   * shared menu document instead of seven forks. Optional for the same reason `repoUrl` is:
   * label expansion never needs it.
   */
  tenantId?: string;
  /**
   * The app's DEFAULT BOOKS — `AppConfig.defaultAccountingTenantId`, the legal entity whose books the
   * catalogued finance menus open. NOT the app tenant: tenant `scs` keeps the books `scs` and `gss`.
   * Used by '@BOOKS@' / '@BOOKS_UPPER@'; '' = the app has no books (rows needing them are hidden).
   */
  booksId?: string;
}

/** Registry of supported tokens → resolver. Keys are the literal tokens found in labels. */
export const MENU_TOKENS: Record<string, (ctx: MenuTokenContext) => string> = {
  '@VERSION@': (ctx) => 'v' + ctx.version,
  // Used in a `browse` item's URL, not in a label: '@REPO_URL@/commits/main/'. Keeping the
  // repository out of the menu document means a repo move is one app-config edit, not a hunt
  // through every tenant's menu docs (which is exactly how the bk2 → openkring/okr rename
  // left the shared `version` item pointing at a dead repo).
  '@REPO_URL@': (ctx) => ctx.repoUrl ?? '',
  // Same '@TID@' spelling `pages.sections` and `feature-catalogue.ts`'s `id: 'news_@TID@'`
  // already use, so one convention covers page ids, section keys and menu urls.
  // '@TID@' is ALWAYS the app tenant — for per-tenant records (album, news pages). Never use it for
  // books: an accounting url takes '@BOOKS@' (the default accountingTenantId), see below.
  '@TID@': (ctx) => ctx.tenantId ?? '',
  // Upper-cased tenant id for a TRANSLATED label — e.g. the catalogued accounting sub-menu
  // whose title reads "SCS Buchhaltung" / "SCS accounting". The token sits inside the i18n
  // VALUE (`item.accounting-menu`), not in the stored label, so the label stays a plain
  // translation key and `MenuStore.translatedMenuLabel` expands the token after translating.
  '@TID_UPPER@': (ctx) => (ctx.tenantId ?? '').toUpperCase(),
  // The app's default books (`AppConfig.defaultAccountingTenantId`) — the accountingTenantId of the
  // catalogued accounting submenu and the member finance rows («Meine Kostenstellen»). A second set of
  // books (gss) is never a token: it gets hand-authored rows with its id written out.
  '@BOOKS@': (ctx) => ctx.booksId ?? '',
  '@BOOKS_UPPER@': (ctx) => (ctx.booksId ?? '').toUpperCase()
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

/** The book tokens: a text carrying one is meaningless while the app has no default books. */
const BOOK_TOKENS = ['@BOOKS@', '@BOOKS_UPPER@'];

/** True when `text` (a url or label) needs the default books but none are configured — such a row is hidden. */
export function lacksBooks(text: string, ctx: MenuTokenContext): boolean {
  return !ctx.booksId && BOOK_TOKENS.some(t => (text ?? '').includes(t));
}

/**
 * Expands the dynamic tokens in a menu item's `url`. Unlike a label, a url is never an i18n
 * key, so this is plain token substitution.
 */
export function resolveMenuUrl(url: string, ctx: MenuTokenContext): string {
  return expandMenuTokens(url, ctx);
}
