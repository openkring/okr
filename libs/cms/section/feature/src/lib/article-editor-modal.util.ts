import { ARTICLE_SECTION_SHAPE, type ArticleSection } from '@okr/shared-models';

/** The rules of the article editor's modal (spec 1.175 §7), without Angular and Ionic. Those of its surface: `article-editor-surface.util.ts`. */

// ------------------------------------------------------- opening -------------------------------------------------------

/** Fields that the suite requires, with what their absence means to readers ('' is no role). */
const FIELD_DEFAULTS = {
  name: '', title: '', subTitle: '', index: '', notes: '', roleNeeded: '', isArchived: false, color: ARTICLE_SECTION_SHAPE.color,
} as const;

/**
 * Reads apply no model defaults: without these, a stored article that lacks such a field could never be saved. A new article has no
 * readers yet: without a role it gets the one of `createSection`, never none.
 */
export function withFieldDefaults(section: ArticleSection, isNew = false): ArticleSection {
  if (isNew && !section.roleNeeded) return withFieldDefaults({ ...section, roleNeeded: ARTICLE_SECTION_SHAPE.roleNeeded });
  const stored = section as unknown as Record<string, unknown>;
  const missing = Object.entries(FIELD_DEFAULTS).filter(([key]) => stored[key] === undefined || stored[key] === null);
  return missing.length === 0 ? section : { ...section, ...Object.fromEntries(missing) } as ArticleSection;
}

// ------------------------------------------------------- closing -------------------------------------------------------

/** Whether the editor may be closed. `done`: it was saved and closes by itself. */
export function closeDecision({ done, saving, changed }: { done: boolean; saving: boolean; changed: boolean }): 'allow' | 'refuse' | 'ask' {
  if (done) return 'allow';
  if (saving) return 'refuse';
  return changed ? 'ask' : 'allow';
}
