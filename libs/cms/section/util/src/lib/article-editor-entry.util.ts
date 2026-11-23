import { articleBlocksOf, type SectionModel } from '@okr/shared-models';

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
