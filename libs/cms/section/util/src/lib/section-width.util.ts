/**
 * The width of a section on the page, per screen size, as columns of a 12-column grid
 * (`BaseSection.colSize`, stored as '12' or '12,6,4' = phone, tablet, large screens).
 * Neighbouring sections narrower than 12 sit side by side: in the app's content page and on the websites.
 */
export type SectionScreen = 'sm' | 'md' | 'lg';
export type SectionWidths = Record<SectionScreen, number>;

export const SECTION_SCREENS: SectionScreen[] = ['sm', 'md', 'lg'];

/** The widths the editor offers: full, 2/3, half, 1/3, 1/4. */
export const SECTION_WIDTHS = [12, 8, 6, 4, 3] as const;
export type SectionWidth = (typeof SECTION_WIDTHS)[number];

const FULL = 12;

function column(part: string | undefined): number | undefined {
  if (part === undefined || !/^\s*\d+\s*$/.test(part)) return undefined;
  const n = parseInt(part, 10);
  return n >= 1 && n <= FULL ? n : undefined;
}

/**
 * Reads a stored colSize. A missing or invalid size inherits the next smaller screen's (as Ionic's
 * `size-md` does), the phone defaults to full width: '' → 12/12/12, '6' → 6/6/6, '12,6' → 12/6/6.
 */
export function parseSectionWidths(colSize: string | undefined | null): SectionWidths {
  const parts = (colSize ?? '').split(',');
  const sm = column(parts[0]) ?? FULL;
  const md = column(parts[1]) ?? sm;
  const lg = column(parts[2]) ?? md;
  return { sm, md, lg };
}

/** The stored form, as short as it can be: 12/6/6 → '12,6', 6/6/6 → '6', 12/12/6 → '12,12,6'. */
export function formatSectionWidths(w: SectionWidths): string {
  if (w.lg !== w.md) return `${w.sm},${w.md},${w.lg}`;
  if (w.md !== w.sm) return `${w.sm},${w.md}`;
  return `${w.sm}`;
}

/**
 * Changes the width of one screen size and returns the new stored colSize. Larger screens that had the same
 * width as the changed one follow it (they inherited it): '12' with tablet → 6 gives '12,6', large screens too.
 */
export function setSectionWidth(colSize: string | undefined | null, screen: SectionScreen, width: number): string {
  const w = parseSectionWidths(colSize);
  const old = w[screen];
  for (const s of SECTION_SCREENS.slice(SECTION_SCREENS.indexOf(screen) + 1)) {
    if (w[s] !== old) break;
    w[s] = width;
  }
  w[screen] = width;
  return formatSectionWidths(w);
}

/** The editor's choices for a stored width: the offered widths plus an odd stored one (kept, not lost). */
export function sectionWidthChoices(current: number): number[] {
  return (SECTION_WIDTHS as readonly number[]).includes(current) ? [...SECTION_WIDTHS] : [...SECTION_WIDTHS, current].sort((a, b) => b - a);
}
