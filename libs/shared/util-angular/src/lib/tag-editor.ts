import { InjectionToken } from '@angular/core';

/**
 * Lets the tag select modal (shared-ui) edit a tag definition's values in place, the way
 * AOC › Tags does, without shared-ui depending on the AppStore. Bound by `provideModelSelector()`
 * in every app.config.ts; injected optionally, so a missing binding just hides the edit button.
 */
export interface TagEditor {
  /**
   * The tag model whose current values are exactly `allChips` (comma-separated), when the viewer
   * may edit tag definitions (admin); undefined otherwise or when no single definition matches.
   */
  editableModel(allChips: string): string | undefined;
  /** The current values of a tag model. Reads signals, so a `computed` around it follows edits. */
  values(tagModel: string): string[];
  /** Appends a value; false when the write failed. */
  add(tagModel: string, value: string): Promise<boolean>;
  /** Removes a value from the definition (records already carrying it keep it); false when the write failed. */
  remove(tagModel: string, value: string): Promise<boolean>;
}

export const TAG_EDITOR = new InjectionToken<TagEditor>('TagEditor');
