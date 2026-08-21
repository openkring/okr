import { describe, expect, it, vi } from 'vitest';

import { dismissOverlay, OverlayDismisser } from './overlay.util';

function controller(dismiss: OverlayDismisser['dismiss']): OverlayDismisser {
  return { dismiss };
}

describe('dismissOverlay', () => {
  it('forwards data and role to the controller and returns its result', async () => {
    const dismiss = vi.fn().mockResolvedValue(true);
    await expect(dismissOverlay(controller(dismiss), { okey: '1' }, 'confirm')).resolves.toBe(true);
    expect(dismiss).toHaveBeenCalledWith({ okey: '1' }, 'confirm');
  });

  it('swallows the string rejection Ionic throws when the overlay is already gone', async () => {
    const dismiss = vi.fn().mockRejectedValue('overlay does not exist');
    await expect(dismissOverlay(controller(dismiss))).resolves.toBe(false);
  });

  it('swallows the same message wrapped in an Error', async () => {
    const dismiss = vi.fn().mockRejectedValue(new Error('overlay does not exist'));
    await expect(dismissOverlay(controller(dismiss))).resolves.toBe(false);
  });

  it('rethrows any other rejection', async () => {
    const dismiss = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(dismissOverlay(controller(dismiss))).rejects.toThrow('boom');
  });

  it('returns false without throwing when no controller was injected', async () => {
    await expect(dismissOverlay(null)).resolves.toBe(false);
    await expect(dismissOverlay(undefined)).resolves.toBe(false);
  });
});
