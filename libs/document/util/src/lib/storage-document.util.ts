/**
 * Utility functions for deriving rich DocumentModel metadata from Firebase Storage
 * file paths and file names.
 */

/** Model types whose path segment should not generate a parent reference. */
const NON_PARENT_TYPES = new Set(['document', 'tenant']);

/** Path segments and model types that map to special extra tags. */
const EXTRA_TAG_MAP: Record<string, string[]> = {
  logo: ['@tag.logo', '@tag.marketing'],
  theme: ['@tag.app'],
  app: ['@tag.app'],
};

/** Inline keywords anywhere in the path that imply specific tags. */
const KEYWORD_TAGS: Record<string, string> = {
  avatar: '@tag.avatar',
  ezs: '@tag.ezs',
  tenu: '@tag.tenu',
};

// ─────────────────────────────────────────────────────────
// 1. Date extraction from file name
// ─────────────────────────────────────────────────────────

/**
 * Checks whether a file name starts with a valid yyyymmdd date prefix.
 * Returns the 8-character date string (StoreDate format) or undefined.
 */
export function extractDateFromFileName(fileName: string): string | undefined {
  const match = fileName.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${match[1]}${match[2]}${match[3]}`; // yyyymmdd = StoreDate
}

/** Converts a StoreDate (yyyymmdd) to a display date (dd.mm.yyyy). */
export function storeDateToDisplayDate(storeDate: string): string {
  return `${storeDate.substring(6, 8)}.${storeDate.substring(4, 6)}.${storeDate.substring(0, 4)}`;
}

// ─────────────────────────────────────────────────────────
// 2. Human-readable title from file name
// ─────────────────────────────────────────────────────────

/**
 * Extracts a human-readable title from a file name:
 * - Strips the file extension
 * - Removes a leading yyyymmdd prefix and appends it as dd.mm.yyyy at the end
 * - Splits on underscores and camelCase/PascalCase boundaries
 * - Capitalises the first word
 *
 * Examples:
 *   "20240117myDocument.pdf"  →  "My Document 17.01.2024"
 *   "invoice_2024_Q1.pdf"     →  "Invoice 2024 Q1"
 *   "ProfileImage.jpg"        →  "Profile Image"
 */
export function extractTitleFromFileName(fileName: string): string {
  // Remove extension
  let base = fileName.replace(/\.[^.]+$/, '');

  // Extract optional leading date
  const dateStr = extractDateFromFileName(base);
  if (dateStr) {
    base = base.substring(8).replace(/^[-_]/, ''); // remove date + optional separator
  }

  // Split on underscores and camelCase/PascalCase boundaries
  let title = base
    .replace(/_+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')   // camelCase boundary
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // consecutive caps before next word
    .trim();

  // Capitalise first letter
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Append date in display format if present
  if (dateStr) {
    const displayDate = storeDateToDisplayDate(dateStr);
    title = title.length > 0 ? `${title} ${displayDate}` : displayDate;
  }

  return title || fileName;
}

// ─────────────────────────────────────────────────────────
// 3. Parent references from storage path
// ─────────────────────────────────────────────────────────

/**
 * Extracts parent references from a Firebase Storage fullPath.
 *
 * Expected format: tenant/TENANT_ID/MODEL_TYPE/KEY[/subdir/file]
 *
 * Returns an array with one entry "MODEL_TYPE.KEY" when MODEL_TYPE is not a
 * built-in container type (document, tenant). Returns an empty array otherwise.
 */
export function extractParentsFromStoragePath(fullPath: string): string[] {
  const segments = fullPath.split('/');
  // [0]='tenant'  [1]=tenantId  [2]=modelType  [3]=key
  const modelType = segments[2];
  const key = segments[3];
  if (!modelType || !key || NON_PARENT_TYPES.has(modelType)) return [];
  return [`${modelType}.${key}`];
}

// ─────────────────────────────────────────────────────────
// 4. Tag extraction from storage path
// ─────────────────────────────────────────────────────────

/**
 * Derives a space-separated tag string from a Firebase Storage fullPath.
 *
 * Rules applied (in order):
 * 1. Tenant segment → @tag.TENANT_ID
 * 2. Model-type segment → EXTRA_TAG_MAP entry if present, else @tag.MODEL_TYPE
 * 3. Inline keyword scan (avatar, ezs, tenu) → corresponding tag
 *
 * Examples:
 *   "tenant/scs/logo/..."          →  "@tag.scs @tag.logo @tag.marketing"
 *   "tenant/scs/theme/..."         →  "@tag.scs @tag.app"
 *   "tenant/scs/person/123/avatar" →  "@tag.scs @tag.person @tag.avatar"
 *   "tenant/scs/address/456/ezs"   →  "@tag.scs @tag.address @tag.ezs"
 */
export function extractTagsFromStoragePath(fullPath: string): string {
  const segments = fullPath.split('/');
  const tenantId = segments[1];
  const modelType = segments[2];
  const tags = new Set<string>();

  if (tenantId) tags.add(`@tag.${tenantId}`);

  if (modelType) {
    const extra = EXTRA_TAG_MAP[modelType];
    if (extra) {
      extra.forEach(t => tags.add(t));
    } else {
      tags.add(`@tag.${modelType}`);
    }
  }

  // Keyword scan over the full path (after modelType)
  const lowerPath = fullPath.toLowerCase();
  for (const [keyword, tag] of Object.entries(KEYWORD_TAGS)) {
    if (lowerPath.includes(keyword)) tags.add(tag);
  }

  return Array.from(tags).join(' ');
}
