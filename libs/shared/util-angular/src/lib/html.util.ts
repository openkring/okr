/**
   * source: https://github.com/ionic-team/ionic-framework/issues/18692
   * @returns true, if we are within a splitpane
   */
export function isInSplitPane(): boolean {
  const _splitPane = document.querySelector('ion-split-pane');
  if (_splitPane === null || _splitPane === undefined) return false;
  return window.innerWidth >= 992;
}

export function stripPostfix(value: string, postfix: string): string {
  if (value.endsWith(postfix)) {
    return value.substring(0, value.length - postfix.length);
  }
  return value;
}

export function stripPrefix(value: string, prefix: string): string {
  if (value.startsWith(prefix)) {
    return value.substring(prefix.length);
  }
  return value;
}

/**
 * Generic function to construct the i18n key for a title label.
 * The constructred key should reference an entry in the i18n translation files.
 * @param prefix usually, this is the model name, e.g. 'resource' or 'subject.person'
 * @param value a string value; usually the key of the model; undefined for new models
 * @param isReadOnly whether the form is read-only or not
 * @returns the constructed i18n key
 */
export function getTitleLabel(prefix: string, value: string | undefined, isReadOnly = true): string {
  let operation = isReadOnly ? 'view' : (!value ? 'create' : 'update');
  return `@${prefix}.operation.${operation}.label`;
}