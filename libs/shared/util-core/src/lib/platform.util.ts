import { isPlatformBrowser } from '@angular/common';

export function isBrowser(platformId: object): boolean {
  return isPlatformBrowser(platformId);
}
