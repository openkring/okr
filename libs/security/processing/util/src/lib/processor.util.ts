import type { AppConfig, OutOfReachRow, ProcessorEntry } from '@okr/shared-models';
import { PROCESSOR_CATALOGUE, type CatalogueEntry } from './processor-catalogue';

export { INTEGRATION_KEYS, PROCESSOR_CATALOGUE } from './processor-catalogue';
export type { CatalogueEntry } from './processor-catalogue';

/** Strip the catalogue-only machinery, leaving the plain register row. */
function toEntry(entry: CatalogueEntry): ProcessorEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { alwaysOn, enabledWhen, cloudFunctions, ...rest } = entry;
  return rest;
}

/** Does this tenant actually transfer data to this processor? */
function isEnabled(entry: CatalogueEntry, config: AppConfig): boolean {
  if (entry.alwaysOn === true) return true;
  return entry.enabledWhen?.(config) === true;
}

/**
 * The tenant's Bearbeitungsverzeichnis: the catalogue filtered by what it has actually
 * switched on, plus the parties it added itself.
 *
 * A disabled integration is absent — that is the whole point. It keeps the register, the
 * processing map and the erasure report from telling a tenant its data sits with a
 * provider it never enabled.
 *
 * Legacy `app-config` documents carry neither `integrations` nor `additionalProcessors`;
 * both are coalesced, so such a tenant sees exactly the always-on platform layer.
 */
export function activeProcessors(config: AppConfig): ProcessorEntry[] {
  const active = PROCESSOR_CATALOGUE.filter((entry) => isEnabled(entry, config)).map(toEntry);
  return [...active, ...(config?.additionalProcessors ?? [])];
}

/** Look up one register row by key, catalogue or tenant-added. `undefined` if unknown. */
export function processorByKey(config: AppConfig, key: string): ProcessorEntry | undefined {
  return activeProcessors(config).find((entry) => entry.key === key);
}

/**
 * Which of our Cloud Functions perform the transfer to this processor — rendered on the
 * register detail page. Tenant-added parties have none: nothing in our code talks to them.
 */
export function cloudFunctionsFor(key: string): readonly string[] {
  return PROCESSOR_CATALOGUE.find((entry) => entry.key === key)?.cloudFunctions ?? [];
}

/**
 * The erasure report's "who else holds a copy" section (spec 5B, fourth section).
 *
 * Derived from `activeProcessors`, so a tenant that never enabled DeepSign is never told
 * its data sits with DeepSign. Before this existed the report named a fixed list — the
 * exact dishonesty the section was written to prevent.
 */
export function outOfReachRows(config: AppConfig): OutOfReachRow[] {
  const notices = new Map(PROCESSOR_CATALOGUE.map((entry) => [entry.key, entry.memberNoticeDe]));
  return activeProcessors(config).map((entry) => ({
    key: entry.key,
    name: entry.name,
    // Catalogue entries speak to the member; a tenant-added party has only the raw
    // contact its admin typed in.
    contact: notices.get(entry.key) ?? entry.contact,
    dataClasses: entry.dataClasses,
  }));
}
