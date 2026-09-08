import { Injector, Type } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { lazyService } from './lazy-service';

class FakeService {}
const TOKEN = FakeService as Type<FakeService>;

/** Minimal Injector stand-in — `lazyService` only ever calls `get`. */
function injectorReturning(instance: unknown): Injector {
  return { get: vi.fn().mockReturnValue(instance) } as unknown as Injector;
}

describe('lazyService', () => {
  it('resolves the token against the injector', async () => {
    const instance = new FakeService();
    const injector = injectorReturning(instance);
    const accessor = lazyService(injector, () => Promise.resolve(TOKEN));

    await expect(accessor()).resolves.toBe(instance);
    expect(injector.get).toHaveBeenCalledWith(TOKEN);
  });

  it('loads the chunk only once across repeated calls', async () => {
    const load = vi.fn().mockResolvedValue(TOKEN);
    const accessor = lazyService(injectorReturning(new FakeService()), load);

    await accessor();
    await accessor();
    await accessor();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight promise between concurrent callers', async () => {
    const load = vi.fn().mockResolvedValue(TOKEN);
    const accessor = lazyService(injectorReturning(new FakeService()), load);

    const [a, b] = await Promise.all([accessor(), accessor()]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  // The point of the catch-reset: one bad fetch must not disable the feature for the page's life.
  it('retries after a failed load instead of caching the rejection', async () => {
    const instance = new FakeService();
    const load = vi.fn().mockRejectedValueOnce(new Error('chunk load failed')).mockResolvedValue(TOKEN);
    const accessor = lazyService(injectorReturning(instance), load);

    await expect(accessor()).rejects.toThrow('chunk load failed');
    await expect(accessor()).resolves.toBe(instance);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not load anything until the accessor is called', () => {
    const load = vi.fn().mockResolvedValue(TOKEN);
    lazyService(injectorReturning(new FakeService()), load);

    expect(load).not.toHaveBeenCalled();
  });
});
