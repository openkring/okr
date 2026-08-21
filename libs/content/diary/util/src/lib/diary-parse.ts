import { DiaryFile, DiaryFrontmatterEntry, DiarySection } from './diary-file';

const FENCE = '---\n';
const KEY_LINE = /^([A-Za-z_][\w-]*):(.*)$/;

/** Split a file into its raw frontmatter block and the body that follows it. */
function splitFrontmatter(text: string): { block: string; body: string } {
  if (!text.startsWith(FENCE)) {
    return { block: '', body: text };
  }
  const end = text.indexOf(`\n${FENCE}`, FENCE.length - 1);
  if (end < 0) {
    return { block: '', body: text };
  }
  return {
    block: text.slice(FENCE.length, end),
    body: text.slice(end + 1 + FENCE.length),
  };
}

function parseFrontmatter(block: string): DiaryFrontmatterEntry[] {
  if (block === '') {
    return [];
  }
  const entries: DiaryFrontmatterEntry[] = [];
  for (const line of block.split('\n')) {
    const match = KEY_LINE.exec(line);
    if (match) {
      entries.push({ key: match[1], raw: match[2] });
    } else if (entries.length > 0) {
      // a continuation line of the previous key, e.g. '  - diary'
      entries[entries.length - 1].raw += `\n${line}`;
    }
  }
  return entries;
}

export function parseDiaryMarkdown(text: string): DiaryFile {
  const { block } = splitFrontmatter(text);
  const sections: DiarySection[] = [];
  return { frontmatter: parseFrontmatter(block), sections };
}
