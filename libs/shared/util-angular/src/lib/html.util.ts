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


/**
 * Returns a string of Ionic column size attributes based on a config string.
 * Use like this: <ion-col size="{{colSizes.size}}" [attr.size-md]="colSizes.sizeMd" [attr.size-lg]="colSizes.sizeLg"
 * @param colSizeConfig - e.g. "6,4,3" → size="6" size-md="4" size-lg="3"
 * @returns an object for attribute binding, e.g. { size: 6, sizeMd: 4, sizeLg: 3 }
 */
export function getColSizes(colSizeConfig: string): { size?: number, sizeMd?: number, sizeLg?: number } {
  if (!colSizeConfig) return { size: 12 };
  const parts = colSizeConfig.split(',').map(s => parseInt(s.trim(), 10));
  const result: { size?: number, sizeMd?: number, sizeLg?: number } = {};
  if (parts[0] >= 1 && parts[0] <= 12) result.size = parts[0];
  if (parts[1] >= 1 && parts[1] <= 12) result.sizeMd = parts[1];
  if (parts[2] >= 1 && parts[2] <= 12) result.sizeLg = parts[2];
  return result;
}
