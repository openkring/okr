import { describe, expect, it, afterEach } from 'vitest';
import { ensurePromiseWithResolvers } from './promise-with-resolvers.util';

type PatchedPromise = PromiseConstructor & { withResolvers?: unknown };

const original = (Promise as PatchedPromise).withResolvers;

const withResolvers = <T>() =>
  ((Promise as PatchedPromise).withResolvers as () => {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
  })();

describe('ensurePromiseWithResolvers', () => {
  afterEach(() => {
    (Promise as PatchedPromise).withResolvers = original;
  });

  it('installs the helper when the runtime lacks it', () => {
    delete (Promise as PatchedPromise).withResolvers;
    ensurePromiseWithResolvers();
    expect(typeof (Promise as PatchedPromise).withResolvers).toBe('function');
  });

  it('keeps a native implementation untouched', () => {
    const native = () => ({});
    (Promise as PatchedPromise).withResolvers = native;
    ensurePromiseWithResolvers();
    expect((Promise as PatchedPromise).withResolvers).toBe(native);
  });

  it('resolves the returned promise via resolve()', async () => {
    delete (Promise as PatchedPromise).withResolvers;
    ensurePromiseWithResolvers();
    const { promise, resolve } = withResolvers<string>();
    resolve('done');
    await expect(promise).resolves.toBe('done');
  });

  it('rejects the returned promise via reject()', async () => {
    delete (Promise as PatchedPromise).withResolvers;
    ensurePromiseWithResolvers();
    const { promise, reject } = withResolvers<string>();
    const error = new Error('nope');
    reject(error);
    await expect(promise).rejects.toBe(error);
  });
});
