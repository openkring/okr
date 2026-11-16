import { InjectionToken } from '@angular/core';

/**
 * Lets a section configuration pick an icon from the icon collection. The ui lib cannot open the
 * icon selector itself (it lives in a feature lib), so the section edit modal provides this.
 * Inject it with `{ optional: true }`: without a provider the icon name is typed by hand.
 */
export interface SectionIconPicker {
  /** Opens the icon selector; resolves to the chosen icon name, or undefined when cancelled. */
  pick(current?: string): Promise<string | undefined>;
}

export const SECTION_ICON_PICKER = new InjectionToken<SectionIconPicker>('SectionIconPicker');
