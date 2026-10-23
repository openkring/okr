export type LearningTab = 'files' | 'videos' | 'images';

/** The tab a document belongs to. SVG is a file: it is not rendered through imgix (see the images skill). */
export function learningTabOf(mimeType: string): LearningTab {
  const m = (mimeType ?? '').toLowerCase();
  if (m.startsWith('video/')) return 'videos';
  if (m.startsWith('image/') && m !== 'image/svg+xml') return 'images';
  return 'files';
}

/** Comma-separated tags -> trimmed, non-empty, de-duplicated, in order. */
export function parseTopics(tags: string): string[] {
  const out: string[] = [];
  for (const t of (tags ?? '').split(',')) {
    const s = t.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
