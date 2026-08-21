import { DiaryFile } from './diary-file';

/**
 * Render a DiaryFile back to markdown — the inverse of parseDiaryMarkdown. Guaranteed for
 * every file the archive and `toDiaryFile` can produce: render(parse(file)) === file, byte
 * for byte, for all 2405 archived entries (see diary-corpus.spec.ts).
 *
 * Two shapes outside that set do not round-trip, neither of which occurs in the archive nor
 * is producible by `toDiaryFile`: an empty frontmatter block ('---\n---\n') renders without
 * its fences, because an empty entry list is indistinguishable from having no frontmatter;
 * and a leading frontmatter line that is not a 'key:' line is dropped by the parser, because
 * there is no previous entry to attach it to as a continuation.
 */
export function renderDiaryMarkdown(file: DiaryFile): string {
  const body = file.sections
    .map(section => (section.heading === '' ? section.content : `${section.heading}${section.content}`))
    .join('');

  if (file.frontmatter.length === 0) {
    return body;
  }

  const block = file.frontmatter.map(entry => `${entry.key}:${entry.raw}`).join('\n');
  return `---\n${block}\n---\n${body}`;
}
