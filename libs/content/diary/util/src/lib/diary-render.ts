import { DiaryFile } from './diary-file';

/**
 * Render a DiaryFile back to markdown. This is the exact inverse of parseDiaryMarkdown:
 * for every file in the archive, render(parse(file)) === file.
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
