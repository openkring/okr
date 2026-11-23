import { convertsExactly, type ArticleSection, type SectionModel } from '@okr/shared-models';

/** How long a writer waits at most: for the answer of the gate and for loading the conversion together. */
const TIMEOUT_MS = 5000;

/**
 * The sections as a writer stores them (spec 1.175 §12): new articles with blocks when blocks may be written, else as today.
 * `mayWrite` is `ArticleBlocksGate.loadMayWrite()`. Never rejects: whatever fails or takes too long writes as today.
 *
 * Only an article that converts exactly gets blocks: an image without url, for example, would be an article that the editor
 * refuses to save. Everything else is returned as it is. The conversion is loaded when it is needed: it lies with the code of
 * the editor, which must be in no chunk that a page of the writers loads.
 */
export async function articlesToWrite<T extends SectionModel>(sections: T[], mayWrite: () => Promise<boolean>): Promise<T[]> {
  if (!sections.some(convertsExactly)) return sections;
  try {
    return await withinTime(convert(sections, mayWrite)) ?? sections;
  } catch (error) {
    console.warn('articlesToWrite: the articles are written without blocks', error);
    return sections;
  }
}

/** The sections with their articles converted; undefined when blocks may not be written. */
async function convert<T extends SectionModel>(sections: T[], mayWrite: () => Promise<boolean>): Promise<T[] | undefined> {
  if (!await mayWrite()) return undefined;
  const { articleWithBlocks } = await import('./article-editor-open.util');
  return sections.map((s) => convertsExactly(s) ? articleWithBlocks(s as unknown as ArticleSection) as unknown as T : s);
}

/** The result; undefined when it does not come in time. */
async function withinTime<T>(result: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), TIMEOUT_MS); });
  try {
    return await Promise.race([result, late]);
  } finally {
    clearTimeout(timer);
  }
}
