import { DiaryFile, DiaryFrontmatterEntry, DiarySection } from './diary-file';

const FENCE = '---\n';
const KEY_LINE = /^([A-Za-z_][\w-]*):(.*)$/;
const HEADING = /^#{1,6} .*$/gm;

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

function parseSections(body: string): DiarySection[] {
  const marks: { index: number; text: string }[] = [];
  HEADING.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEADING.exec(body)) !== null) {
    marks.push({ index: match.index, text: match[0] });
  }

  const sections: DiarySection[] = [];
  const firstAt = marks.length > 0 ? marks[0].index : body.length;
  // the preamble is kept when it carries anything, and always when there is no heading at all
  if (firstAt > 0 || marks.length === 0) {
    sections.push({ heading: '', content: body.slice(0, firstAt) });
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i].text.length;
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    sections.push({ heading: marks[i].text, content: body.slice(start, end) });
  }
  return sections;
}

export function parseDiaryMarkdown(text: string): DiaryFile {
  const { block, body } = splitFrontmatter(text);
  return { frontmatter: parseFrontmatter(block), sections: parseSections(body) };
}
