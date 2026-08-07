import { RoleName, SectionModel, TOC_CONFIG_SHAPE, TocConfig, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';

/** One entry of the table of contents: an anchor (the section okey) and its label. */
export interface TocEntry {
  key: string;
  label: string;
}

/** Firestore reads return raw documents — older sections lack the newer fields. */
export function withTocDefaults(config: TocConfig | undefined): TocConfig {
  return {
    sectionKeys: config?.sectionKeys ?? TOC_CONFIG_SHAPE.sectionKeys,
    numbered: config?.numbered ?? TOC_CONFIG_SHAPE.numbered,
  };
}

/**
 * Builds the entries from the sections of the page, in page order.
 *
 * Mirrors the visibility rules of the ContentPage/SectionDispatcher — an entry that the user could
 * not see must not be listed: unpublished sections only in edit mode, and the section's
 * `roleNeeded` must be met. The TOC section itself is never listed.
 *
 * @param sections  the sections of the page, already in page order
 * @param config    the TOC config; an empty `sectionKeys` lists every section (auto mode)
 * @param selfKey   okey of the TOC section itself
 */
export function tocEntries(
  sections: SectionModel[],
  config: TocConfig | undefined,
  selfKey: string | undefined,
  currentUser: UserModel | undefined,
  editMode: boolean
): TocEntry[] {
  const cfg = withTocDefaults(config);
  const selected = new Set(cfg.sectionKeys);
  return sections
    .filter((s) => s.okey !== selfKey)
    .filter((s) => selected.size === 0 || selected.has(s.okey))
    .filter((s) => editMode || s.state === 'published')
    .filter((s) => hasRole(s.roleNeeded as RoleName, currentUser))
    .map((s) => ({ key: s.okey, label: (s.title?.trim() || s.name?.trim()) ?? '' }))
    .filter((e) => e.label.length > 0);
}

/** Parses the editor text (one key per line or comma-separated) into a key list. */
export function parseTocKeys(text: string): string[] {
  return text.split(/[\n,]/).map((k) => k.trim()).filter((k) => k.length > 0);
}

/** Renders the key list for the editor; '' means auto mode (all sections). */
export function stringifyTocKeys(keys: string[] | undefined): string {
  return (keys ?? []).join('\n');
}
