/* eslint-disable prettier/prettier */
import { fromEvent, map, merge, startWith } from 'rxjs';

/**
 * Observable that emits true when the browser is online and false when it is offline.
 * see https://stackoverflow.com/questions/42927071/check-web-app-is-online-or-offline
 * seehttps://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
 *
 * usage:
 * isOnline$.subscribe(isOnline => console.log('isOnline: ', isOnline));
 */

export const isOnline$ = merge(
  fromEvent(window, 'online'),
  fromEvent(window, 'offline')
).pipe(
  map(() => navigator.onLine),
  startWith(navigator.onLine)
);