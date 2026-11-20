/**
 * Section widths on a rendered website (`BaseSection.colSize`, '12' or '12,6,4' = phone, tablet, large screens,
 * columns of 12). Consecutive sections narrower than the full width share one row (partials/section-row.hbs);
 * the row is a 12-column grid, so neighbours stand side by side as long as they fit, and wrap otherwise.
 * Mirrors parseSectionWidths in @okr/cms-section-util (the editor and the app), which this lib cannot import.
 */
export interface SectionColumnWidths { sm: number; md: number; lg: number }

const FULL = 12;

function column(part: string | undefined): number | undefined {
  if (part === undefined || !/^\s*\d+\s*$/.test(part)) return undefined;
  const n = parseInt(part, 10);
  return n >= 1 && n <= FULL ? n : undefined;
}

/** '' → 12/12/12; '6' → 6/6/6; '12,6' → 12/6/6 — a missing size inherits the smaller screen's. */
export function sectionColumnWidths(colSize: unknown): SectionColumnWidths {
  const parts = typeof colSize === 'string' ? colSize.split(',') : typeof colSize === 'number' ? [String(colSize)] : [];
  const sm = column(parts[0]) ?? FULL;
  const md = column(parts[1]) ?? sm;
  const lg = column(parts[2]) ?? md;
  return { sm, md, lg };
}

/** Whether a section takes less than the full width on some screen. */
export function isNarrowSection(w: SectionColumnWidths): boolean {
  return w.sm < FULL || w.md < FULL || w.lg < FULL;
}

/** Section types that always span the page (a hero banner, the self-running slideshow header). */
const ALWAYS_FULL = new Set(['hero']);

/**
 * The runs of consecutive narrow sections, as lists of indices (`null` = a section that is not rendered, which
 * neither joins nor breaks a run). A full-width section, or one of ALWAYS_FULL, ends a run.
 */
export function sectionRows(sections: ({ type?: unknown; colSize?: unknown; slideshow?: unknown } | null)[]): number[][] {
  const rows: number[][] = [];
  let run: number[] = [];
  sections.forEach((s, i) => {
    if (s === null) return;
    const narrow = !ALWAYS_FULL.has(String(s.type ?? '')) && !s.slideshow && isNarrowSection(sectionColumnWidths(s.colSize));
    if (narrow) run.push(i);
    else if (run.length) { rows.push(run); run = []; }
  });
  if (run.length) rows.push(run);
  return rows;
}
