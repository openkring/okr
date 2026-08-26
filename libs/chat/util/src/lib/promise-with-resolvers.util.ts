/**
 * `Promise.withResolvers()` is ES2024 and only reached Safari in 17.4 (March 2024) —
 * Safari 16.x on macOS Ventura and iOS 16 do not have it. matrix-js-sdk 42 calls it on
 * hot paths (the send scheduler, the HTTP API, sync), so on those browsers sending a
 * message throws `Promise.withResolvers is not a function` and the chat silently fails
 * (Sentry SCS-9M).
 *
 * The app targets es2020, so the built-in is neither compiled away nor polyfilled by the
 * Angular build. Install a spec-equivalent implementation once, before the Matrix client
 * is created. Every lib here is marked `sideEffects: false`, so this must be an explicit
 * call — a bare side-effect import would be tree-shaken out of the production bundle.
 */
export function ensurePromiseWithResolvers(): void {
  const promiseCtor = Promise as PromiseConstructor & {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };

  if (typeof promiseCtor.withResolvers === 'function') return;

  promiseCtor.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
