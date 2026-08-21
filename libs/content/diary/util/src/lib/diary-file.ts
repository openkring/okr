/** The token that marks a markdown file in a day folder as a diary entry: `[yyyymmdd]diary[Title].md`. */
export const DIARY_FILE_MARKER = 'diary';

/**
 * One frontmatter key with its value kept verbatim. `raw` is everything after the colon,
 * including the leading space and any continuation lines of a YAML block list — so that
 * `${key}:${raw}` reproduces the original lines exactly.
 */
export interface DiaryFrontmatterEntry {
  key: string;
  raw: string;
}

/**
 * One markdown section. `heading` is the heading line verbatim (e.g. '## Persönliche Gedanken')
 * and is empty for the preamble that precedes the first heading. `content` is everything from
 * the end of the heading text up to the next heading — which means it STARTS with the newline
 * that terminates the heading line. That is what makes `heading + content` an exact inverse,
 * including for a file whose last line is a heading with no trailing newline.
 */
export interface DiarySection {
  heading: string;
  content: string;
}

/** A lossless representation of a diary markdown file. Slugs stay slugs, values stay raw. */
export interface DiaryFile {
  frontmatter: DiaryFrontmatterEntry[];
  sections: DiarySection[];
}
