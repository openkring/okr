import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';


/**
   * source: https://github.com/ionic-team/ionic-framework/issues/18692
   * @returns true, if we are within a splitpane
   */
export function isInSplitPane(): boolean {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) return false;
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
