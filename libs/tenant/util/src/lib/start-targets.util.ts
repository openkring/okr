import { FOOTPRINT_PAGE_TYPE, type MenuItemModel, type PageModel } from '@okr/shared-models';
import { forkKeyFor, getSafeReturnUrl } from '@okr/shared-util-core';

import type { FeatureBlock } from './feature-catalogue.types';
import { blockOwnersOfMenuKey } from './feature-routes.util';
import type { SettingsPageOption } from './tenant-settings-display';

/** A page a tenant can start with. `label` is the raw label of the menu row (often an i18n key) or the name of the page. */
export interface StartTarget { url: string; label: string; }

export interface StartTargetsInput {
  menuDocs: readonly MenuItemModel[];
  pages: readonly PageModel[];
  blocks: FeatureBlock[];
  isEnabled: (blockId: string) => boolean;
  /** `app-config.hiddenMenuKeys` */
  hiddenKeys: ReadonlySet<string>;
  tenantId: string;
}

/** Roles every signed-in person has; '' / absent and the legacy 'none' mean 'public' (see `hasRole`). */
const OPEN_ROLES: ReadonlySet<string> = new Set(['', 'none', 'public', 'registered']);

function pathSegments(url: string): string[] {
  return url.split(/[?#]/)[0].split('/').filter(Boolean);
}

/**
 * The url a guard can open, '' when there is none. The stored start page is opened as it is: nothing resolves a token
 * at that point, so `@TID@` is resolved here, and a url that needs the books or a record is not offered.
 */
function targetUrl(raw: string | undefined, tenantId: string): string {
  const text = (raw ?? '').trim().split('@TID@').join(tenantId);
  if (text === '' || text.includes('://') || text.includes('@') || /\/:/.test(text)) return '';
  const url = getSafeReturnUrl(text.startsWith('/') ? text : `/${text}`) ?? '';
  // signing in or out is no page to start with: the sign-out row would end every session at its start
  return pathSegments(url)[0] === 'auth' ? '' : url;
}

interface DeclaredPaths { id: string; paths: string[][]; }

/** The paths of the menu rows each block declares. */
function declaredPaths(input: StartTargetsInput): DeclaredPaths[] {
  const navigateUrls = (specs: FeatureBlock['menu']): string[] => specs.flatMap((spec) => [
    ...(spec.action === 'navigate' && spec.url ? [spec.url.split('@TID@').join(input.tenantId)] : []), ...navigateUrls(spec.children ?? []),
  ]);
  return input.blocks.map((block) => ({ id: block.id, paths: navigateUrls(block.menu).map(pathSegments) }));
}

/**
 * The blocks behind the url: those whose menu holds this very path, else those that share its first segment
 * (`/calevent/…`). A url no block knows is an own page.
 */
function blocksOfUrl(url: string, declared: readonly DeclaredPaths[]): string[] {
  const segments = pathSegments(url);
  const exact = declared.filter((block) => block.paths.some((path) => path.join('/') === segments.join('/')));
  const owners = exact.length > 0 ? exact : declared.filter((block) => block.paths.some((path) => path[0] === segments[0]));
  return owners.map((block) => block.id);
}

/** Can every signed-in person see the row: its own role, hidden key and block, and at least one way down to it? */
function isRowOpen(row: MenuItemModel, input: StartTargetsInput, visiting: ReadonlySet<string> = new Set()): boolean {
  if (visiting.has(row.name)) return false;
  if (row.isArchived || input.hiddenKeys.has(row.name) || !OPEN_ROLES.has(row.roleNeeded ?? '')) return false;
  const owners = blockOwnersOfMenuKey(input.blocks, row.name);
  if (owners.length > 0 && !owners.some((id) => input.isEnabled(id))) return false;
  const parents = input.menuDocs.filter((doc) => (doc.menuItems ?? []).includes(row.name));
  const next = new Set(visiting).add(row.name);
  return parents.length === 0 || parents.some((parent) => isRowOpen(parent, input, next));
}

/**
 * The pages a tenant can start with (spec 1.174 §7.4): the rows of its menus that every signed-in person can open, and
 * its pages that are visible without signing in. A row is judged by its own role and by the menus it hangs under: one
 * of them must be open all the way up; a row in no menu is judged by itself. The blocks that declare the row, and those
 * behind its url (which catches a row the tenant made itself), must be on. That includes a `beta` block the operator opened
 * for this tenant: a visitor cannot read that, but the feature guard sends them to the login and back (`featureOffUrl`),
 * as any page for members does. Each url is listed once, rows first.
 */
export function startTargets(input: StartTargetsInput): StartTarget[] {
  const declared = declaredPaths(input);
  const isUrlOpen = (url: string): boolean => {
    const owners = blocksOfUrl(url, declared);
    return owners.length === 0 || owners.some((id) => input.isEnabled(id));
  };
  const rows = input.menuDocs
    .filter((row) => row.action === 'navigate' && isRowOpen(row, input))
    .map((row) => ({ url: targetUrl(row.url, input.tenantId), label: row.label }))
    .filter((target) => target.url !== '' && isUrlOpen(target.url));
  const pageKeys = new Set(input.pages.map((p) => p.okey));
  const pages = input.pages
    .filter((p) => !p.isPrivate && !p.isArchived && p.type !== FOOTPRINT_PAGE_TYPE && p.type !== 'error')
    .filter((p) => !pageKeys.has(forkKeyFor(p.okey, input.tenantId)))
    .map((p) => ({ url: `/public/${p.okey}`, label: p.name || p.title || p.okey }));
  const targets = [...rows, ...pages];
  return targets.filter((target, i) => targets.findIndex((other) => other.url === target.url) === i);
}

/**
 * The select options, by label: the key is the url. Equal labels carry their url, a target without a label is its url.
 * The stored url is always among them; one the list does not know (with a query, say) comes first and as it is.
 */
export function startOptions(targets: readonly StartTarget[], stored: string): SettingsPageOption[] {
  const count = new Map<string, number>();
  for (const { label } of targets) count.set(label, (count.get(label) ?? 0) + 1);
  const options = targets
    .map(({ url, label }) => ({ key: url, label: !label ? url : (count.get(label) ?? 0) > 1 ? `${label} (${url})` : label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return stored === '' || options.some((o) => o.key === stored) ? options : [{ key: stored, label: stored }, ...options];
}
