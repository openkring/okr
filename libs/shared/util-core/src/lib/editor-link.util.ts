/**
 * Link validation pattern for okr-editor (ngx-editor `linkValidationPattern`).
 * ngx-editor's default (absolute URLs and mailto) plus site-relative paths such as `/vorstand`.
 * Angular's Validators.pattern only prepends '^' and appends '$' without grouping, so the whole
 * alternation is wrapped in a non-capturing group to anchor every branch.
 */
export const EDITOR_LINK_PATTERN =
  '(?:(https?://)?([\\da-z.-]+)\\.([a-z.]{2,6})[/\\w .-]*/??([^#\\n\\r]*)?#?([^\\n\\r]*)|(mailto:.*[@].*)|(/(?![/\\\\])[^\\s]*))';
