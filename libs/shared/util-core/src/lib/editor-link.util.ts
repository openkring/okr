/**
 * Link validation pattern for the rich-text editor's link prompt (okr-rich-text-input).
 * Absolute URLs and mailto (ngx-editor's old default) plus site-relative paths such as `/vorstand`.
 * Angular's Validators.pattern only prepends '^' and appends '$' without grouping, so the whole
 * alternation is wrapped in a non-capturing group to anchor every branch.
 */
export const EDITOR_LINK_PATTERN =
  '(?:(https?://)?([\\da-z.-]+)\\.([a-z.]{2,6})[/\\w .-]*/??([^#\\n\\r]*)?#?([^\\n\\r]*)|(mailto:.*[@].*)|(/(?![/\\\\])[^\\s]*))';
