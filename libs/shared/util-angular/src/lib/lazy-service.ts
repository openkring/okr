import { Injector, Type } from '@angular/core';

/**
 * Build a cached accessor for a service that must not be statically imported.
 *
 * A static import of a service's lib is a *binding edge*: it pulls the whole library into the
 * importer's eager chunk, no matter that the service is only used behind a button. That is how
 * matrix-js-sdk (198 KB transfer) ended up before the dashboard's LCP — see spec 1.49, F1, and
 * the `lazy-loading` skill.
 *
 * The loader resolves the *class token* from a dynamic import; the injector then hands back the
 * root-provided singleton, so every caller shares one instance:
 *
 * ```ts
 * chatService: lazyService(inject(Injector), () =>
 *   loadChatDataAccess().then(m => m.MatrixChatService)),
 * ```
 *
 * where the loader is a dynamic import of the service's lib, written inline at the call site.
 * (It is spelled indirectly here on purpose: `gen-lib-references.mjs` scans comments too, and a
 * literal dynamic-import of an `@okr/*` alias in this doc block would register as a real
 * dependency of this lib and produce a reference cycle.)
 *
 * The resolved promise is cached, so the chunk is fetched once. A **failed** load is deliberately
 * not cached: the entry is dropped so the next call retries. Without that, one bad fetch (a flaky
 * network, a chunk evicted mid-deploy) would poison the accessor for the lifetime of the page and
 * a feature would stay dead until reload.
 *
 * @param injector the injector to resolve the token against — pass `inject(Injector)` from a field
 *   initialiser or a `withProps` factory, where an injection context exists.
 * @param load returns the service's class token from a dynamic import.
 * @returns an accessor returning the shared instance; safe to call concurrently.
 */
export function lazyService<T>(injector: Injector, load: () => Promise<Type<T>>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= load()
      .then((token) => injector.get(token))
      .catch((e) => {
        pending = undefined;
        throw e;
      }));
}
