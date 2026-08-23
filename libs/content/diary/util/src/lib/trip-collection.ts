/** One `archive/collections/trips/*.md` file, reduced to what a TripModel needs. */
export interface TripCollectionFile {
  slug: string;
  title: string;
  startDate: string;   // StoreDate, YYYY-MM-DD
  endDate: string;     // StoreDate, YYYY-MM-DD
  people: string[];    // raw slugs; resolution happens against the aliases, not here
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const SPAN = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

function field(front: string, key: string): string {
  return new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
}

/**
 * All 39 files are uniform (measured 2026-08-23), so every deviation is thrown rather than
 * tolerated: a silently skipped trip would leave 2–19 diary entries with an unresolvable
 * `tripKey`, and nothing downstream would report it.
 */
export function parseTripCollection(fileName: string, text: string): TripCollectionFile {
  const front = FRONTMATTER.exec(text)?.[1];
  if (!front) throw new Error(`${fileName}: no frontmatter`);
  if (field(front, 'kind') !== 'trip') throw new Error(`${fileName}: kind is not 'trip'`);

  const slug = fileName.replace(/\.md$/, '');
  const querySlug = /^trip\s*==\s*(.+)$/.exec(field(front, 'query'))?.[1]?.trim() ?? '';
  if (querySlug !== slug) {
    throw new Error(`${fileName}: query slug '${querySlug}' does not match the file name slug '${slug}'`);
  }

  const span = SPAN.exec(field(front, 'span'));
  if (!span) throw new Error(`${fileName}: span must be 'YYYY-MM-DD..YYYY-MM-DD'`);

  const inline = /^people:\s*\[(.*)\]\s*$/m.exec(front)?.[1] ?? '';
  const people = inline.split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);

  return { slug, title: field(front, 'title'), startDate: span[1], endDate: span[2], people };
}
