import { TESTIMONIAL_CONFIG_SHAPE, TestimonialConfig, TestimonialEntry } from '@okr/shared-models';

/** Firestore reads return raw documents — older sections lack the newer fields. */
export function withTestimonialDefaults(config: TestimonialConfig | undefined): TestimonialConfig {
  return {
    entries: config?.entries ?? TESTIMONIAL_CONFIG_SHAPE.entries,
    layout: config?.layout ?? TESTIMONIAL_CONFIG_SHAPE.layout,
    columns: config?.columns ?? TESTIMONIAL_CONFIG_SHAPE.columns,
  };
}

/**
 * Keeps only entries that can be rendered — a quote is the whole point, an anonymous quote is
 * not a testimonial — and coalesces the optional fields so the template never sees `undefined`.
 */
export function validTestimonials(entries: TestimonialEntry[] | undefined): TestimonialEntry[] {
  return (entries ?? [])
    .filter((e) => typeof e?.quote === 'string' && e.quote.trim().length > 0 &&
      typeof e?.authorName === 'string' && e.authorName.trim().length > 0)
    .map((e) => ({
      quote: e.quote.trim(),
      authorName: e.authorName.trim(),
      authorRole: e.authorRole?.trim() ?? '',
      imageUrl: e.imageUrl?.trim() ?? '',
      detail: e.detail?.trim() ?? '',
      link: e.link?.trim() ?? '',
    }));
}

/** Column count for the grid layout, clamped to 1–4 (mobile collapses to one column in CSS). */
export function testimonialColumns(columns: number | undefined): number {
  const cols = Math.round(columns ?? TESTIMONIAL_CONFIG_SHAPE.columns);
  return Number.isFinite(cols) ? Math.min(4, Math.max(1, cols)) : TESTIMONIAL_CONFIG_SHAPE.columns;
}

/** Parses the entries JSON from the editor; undefined for invalid JSON or a non-array. */
export function parseTestimonials(text: string): TestimonialEntry[] | undefined {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as TestimonialEntry[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Pretty-prints the entries as JSON; '' for an empty list. */
export function stringifyTestimonials(entries: TestimonialEntry[] | undefined): string {
  if (!entries || entries.length === 0) return '';
  return JSON.stringify(entries, null, 2);
}
