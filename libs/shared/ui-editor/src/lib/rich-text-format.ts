/** How a field stores its text (spec 1.170 §4.1); chosen per field by the developer, never by the author. */
export type RichTextFormat = 'html' | 'markdown';

/** What an empty field stores, per format. */
export const EMPTY_RICH_TEXT: Record<RichTextFormat, string> = { html: '<p></p>', markdown: '' };
