import { InjectionToken } from '@angular/core';

/**
 * Decides which image of a page loads first (`fetchpriority="high"`, `loading="eager"`): the first `okr-img`
 * drawn inside the page's first section claims it, every other image loads lazily. This replaced the
 * per-style `hasPriority` flag (2026-11-27), which editors could not judge and which marked whole albums
 * as urgent. `SectionDispatcher` provides one per section; only the one of the first section is enabled.
 */
export class ImagePriority {
  private claimed = false;

  constructor(private readonly isEnabled: () => boolean) {}

  /** true for the first caller while enabled, false for everyone after it */
  public claim(): boolean {
    if (this.claimed || !this.isEnabled()) return false;
    this.claimed = true;
    return true;
  }
}

export const IMAGE_PRIORITY = new InjectionToken<ImagePriority>('IMAGE_PRIORITY');
