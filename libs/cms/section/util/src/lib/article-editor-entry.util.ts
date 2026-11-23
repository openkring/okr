import { articleBlocksOf, type ArticleSection, type SectionModel } from '@okr/shared-models';

import { createSection } from './section.util';

/**
 * Where the article editor opens (spec 1.175 §7.1, §7.6, §11). In a file of its own: the pages and stores that readers load ask these
 * rules, and `article-editor-open.util.ts` is only for the editor.
 */

/** Whether a section is edited in the article editor; otherwise today's form opens. An article with blocks has no other editor. */
export function usesArticleEditor(section: SectionModel, readOnly: boolean, gateOpen: boolean): boolean {
  if (section.type !== 'article' || section.journalKey || readOnly) return false;
  return gateOpen || articleBlocksOf(section) !== undefined;
}

/** Whether the page menu offers «Bild hochladen» for a section: an article that is not edited in the article editor. */
export function offersImageUpload(section: SectionModel | undefined, gateOpen: boolean): boolean {
  return section?.type === 'article' && !gateOpen && articleBlocksOf(section) === undefined;
}

/** What says nothing must not replace a default; an empty role, for example, lets everybody see the article. */
const isSet = (value: unknown): boolean => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
const setOnly = (value: object | null | undefined): Record<string, unknown> => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => isSet(v)));

/**
 * A new article for the editor (spec 1.175 §12): as `createSection('article')` makes it, so it always has a role, a date and the whole
 * shape, with what is set in `section`. It gets its key now, so that its uploads have a folder of their own.
 */
export function newArticleFrom(section: SectionModel, tenantId: string, okey: string): ArticleSection {
  const created = createSection('article', tenantId) as ArticleSection;
  const properties = { ...created.properties, ...setOnly(section.properties) };
  return { ...created, ...setOnly(section), type: 'article', properties, okey } as ArticleSection;
}
