import { Signal, computed } from '@angular/core';
import { activeProcessors, cloudFunctionsFor } from '@okr/security-processing-util';
import type { AppConfig, ProcessorCategory, ProcessorEntry } from '@okr/shared-models';

/** Where a register row came from — the shipped catalogue, or this tenant's own list. */
export type ProcessorOrigin = 'catalogue' | 'tenant';

export interface RegisterFilter {
  readonly category?: ProcessorCategory;
  /** ISO 3166-1 alpha-2. */
  readonly country?: string;
  readonly origin?: ProcessorOrigin;
}

export interface RegisterView {
  /** Every processor this tenant actually transfers to. */
  readonly entries: Signal<ProcessorEntry[]>;
  readonly byKey: (key: string) => Signal<ProcessorEntry | undefined>;
  readonly filtered: (filter: RegisterFilter) => Signal<ProcessorEntry[]>;
  /** The countries present in `entries`, sorted — the country filter's options. */
  readonly countries: Signal<string[]>;
  /** The categories present in `entries`, sorted — the category filter's options. */
  readonly categories: Signal<ProcessorCategory[]>;
  readonly cloudFunctionsFor: (key: string) => readonly string[];
}

/**
 * The whole register as pure signal derivation over one config signal.
 *
 * Extracted from the service so it is testable without Angular's DI: the service is a
 * two-line shell around it. There is deliberately **no Firestore access** anywhere here —
 * the catalogue is code and the tenant's own entries ride on `app-config`, which the
 * AppStore already streams.
 */
export function buildRegisterView(config: Signal<AppConfig>): RegisterView {
  const entries = computed(() => activeProcessors(config()));

  // Tenant-added rows are exactly the ones the config carries; everything else came from
  // the catalogue. Comparing by key rather than by identity keeps this true even after
  // `activeProcessors` has copied the objects.
  const tenantKeys = computed(() => new Set((config()?.additionalProcessors ?? []).map((e) => e.key)));

  const matches = (entry: ProcessorEntry, filter: RegisterFilter, tenant: Set<string>): boolean => {
    if (filter.category && entry.category !== filter.category) return false;
    if (filter.country && entry.country !== filter.country) return false;
    if (filter.origin === 'tenant' && !tenant.has(entry.key)) return false;
    if (filter.origin === 'catalogue' && tenant.has(entry.key)) return false;
    return true;
  };

  return {
    entries,
    byKey: (key) => computed(() => entries().find((entry) => entry.key === key)),
    filtered: (filter) => computed(() => entries().filter((e) => matches(e, filter, tenantKeys()))),
    countries: computed(() => [...new Set(entries().map((e) => e.country))].sort()),
    categories: computed(() => [...new Set(entries().map((e) => e.category))].sort()),
    cloudFunctionsFor,
  };
}
