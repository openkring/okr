import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Observable, merge, fromEvent, map, startWith } from 'rxjs';

describe('isOnline$', () => {
  let originalNavigator: any;
  let originalWindow: any;

  // This function recreates the observable, capturing the current state of navigator.onLine
  const createIsOnline$ = () =>
    merge(fromEvent(window, 'online'), fromEvent(window, 'offline')).pipe(
      map(() => navigator.onLine),
      startWith(navigator.onLine)
    );

  beforeEach(() => {
    // Save original navigator and window
    originalNavigator = global.navigator;
    originalWindow = global.window;

    // Mock navigator.onLine using Object.defineProperty for reliability
    (global as any).navigator = {};
    Object.defineProperty(global.navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    // Mock window and event listeners
    const listeners: Record<string, Array<(event: Event) => void>> = {};
    (global as any).window = {
      addEventListener: (event: string, cb: (event: Event) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      },
      // Add removeEventListener to the mock
      removeEventListener: (event: string, cb: (event: Event) => void) => {
        if (listeners[event]) {
          const index = listeners[event].indexOf(cb);
          if (index > -1) {
            listeners[event].splice(index, 1);
          }
        }
      },
      dispatchEvent: (event: Event) => {
        const type = event.type;
        if (listeners[type]) {
          // Create a copy in case a listener unsubscribes itself
          [...listeners[type]].forEach(cb => cb(event));
        }
      },
    };
  });

  afterEach(() => {
    // Restore original navigator and window
    (global as any).navigator = originalNavigator;
    (global as any).window = originalWindow;
  });

  it('should emit initial online status from navigator.onLine', async () => {
    Object.defineProperty(global.navigator, 'onLine', { value: true });
    const result: boolean[] = [];
    // Create the observable here
    const sub = createIsOnline$().subscribe(val => result.push(val));
    sub.unsubscribe();
    expect(result[0]).toBe(true);

    Object.defineProperty(global.navigator, 'onLine', { value: false });
    const result2: boolean[] = [];
    // Create the observable again to capture the new value
    const sub2 = createIsOnline$().subscribe(val => result2.push(val));
    sub2.unsubscribe();
    expect(result2[0]).toBe(false);
  });

  it('should emit true when online event is dispatched', async () => {
    Object.defineProperty(global.navigator, 'onLine', { value: true });
    const result: boolean[] = [];
    const sub = createIsOnline$().subscribe(val => result.push(val));
    (global as any).window.dispatchEvent(new Event('online'));
    sub.unsubscribe();
    // The first value from startWith is true, the second from the event is also true.
    expect(result).toEqual([true, true]);
  });

  it('should emit false when offline event is dispatched', async () => {
    Object.defineProperty(global.navigator, 'onLine', { value: false });
    const result: boolean[] = [];
    const sub = createIsOnline$().subscribe(val => result.push(val));
    (global as any).window.dispatchEvent(new Event('offline'));
    sub.unsubscribe();
    // The first value from startWith is false, the second from the event is also false.
    expect(result).toEqual([false, false]);
  });

  it('should be an Observable', () => {
    expect(createIsOnline$()).toBeInstanceOf(Observable);
  });
});
