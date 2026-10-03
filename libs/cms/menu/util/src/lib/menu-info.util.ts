/**
 * `MenuItemModel.info` is HTML from the menu editor's rich-text field, or an i18n key ('@…')
 * whose translation may itself be HTML.
 */

/** Empty paragraphs (`<p></p>`, `<p><br></p>`, `&nbsp;`) are what the editor leaves behind when cleared. */
const EMPTY_HTML = /^(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)*$/i;

/** The info as stored, or '' when there is nothing to show (undefined, blank, or an empty editor). */
export function normalizeMenuInfo(info: string | undefined | null): string {
  const text = (info ?? '').trim();
  return EMPTY_HTML.test(text) ? '' : text;
}

/** The i18n key when the info is just '@key' — bare, or wrapped in the one `<p>` the editor adds. */
export function menuInfoKey(info: string): string | undefined {
  return /^(?:<p>)?\s*(@[\w./-]+)\s*(?:<\/p>)?$/.exec(info.trim())?.[1];
}
