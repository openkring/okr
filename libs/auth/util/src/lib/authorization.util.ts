/* eslint-disable prettier/prettier */
import { fromEvent, map, merge, startWith } from 'rxjs';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, fromEvent, merge } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

/**
 * Observable that emits true when the browser is online and false when it is offline.
 * see https://stackoverflow.com/questions/42927071/check-web-app-is-online-or-offline
 * seehttps://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
 *
 * usage:
 * isOnline$.subscribe(isOnline => console.log('isOnline: ', isOnline));
 */

export const isOnline$: Observable<boolean> = (() => {
  const platformId = inject(PLATFORM_ID);
  if (isPlatformBrowser(platformId)) {
    return merge(
      fromEvent(window, 'online'),
      fromEvent(window, 'offline')
    ).pipe(
      map(() => navigator.onLine),
      startWith(navigator.onLine)
    );
  } else {
    // Not in browser, assume offline or unknown
    console.warn('isOnline$: not in browser, returning false');
    return of(false);
  }
})();