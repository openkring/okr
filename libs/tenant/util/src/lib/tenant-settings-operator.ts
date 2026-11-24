import type { AppConfig, ProcessorEntry } from '@okr/shared-models';

/** A tenant the operator can choose on `/operator/settings`. */
export interface TenantChoice { id: string; label: string; }

/**
 * Every tenant with an `app-config` document, by name: «Name (id)», the id alone when the app has no name. An archived
 * tenant is listed too, with `archivedText`: the mark has no effect, and the operator must be able to take it back.
 */
export function tenantChoices(configs: readonly (Partial<AppConfig> & { okey: string })[], archivedText: string): TenantChoice[] {
  return configs.filter((config) => !!config.okey).map((config) => {
    const name = typeof config.appName === 'string' ? config.appName.trim() : '';
    const label = name === '' ? config.okey : `${name} (${config.okey})`;
    return { id: config.okey, label: config.isArchived === true ? `${label}, ${archivedText}` : label };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

/** The app domains of all tenants but `tenantId`, lower case and trimmed: what `SettingsContext.takenAppDomains` wants. Archived tenants count. */
export function takenAppDomains(configs: readonly (Partial<AppConfig> & { okey: string })[], tenantId: string): string[] {
  return configs.filter((config) => config.okey !== tenantId)
    .map((config) => (typeof config.appDomain === 'string' ? config.appDomain.trim().toLowerCase() : ''))
    .filter((domain) => domain !== '');
}

/** A mail service as the operator reads it: its id, with a note on the one that delivers nothing. */
export function emailProviderLabel(provider: string, testText: string): string {
  return provider === 'mailtrap_test' ? `${provider} (${testText})` : provider;
}

/** A service a tenant can be connected to: the key of `AppConfig.integrations` and the name of the service. */
export interface IntegrationOption { key: string; name: string; }

/** One line of the integrations in the platform form. An unknown one is stored, but `options` does not have it: shown, never changed. */
export interface IntegrationRow extends IntegrationOption { on: boolean; known: boolean; }

function integrationsOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** One line per known service, then the stored keys that are not among them. Only `true` counts as on, as for the register. */
export function integrationRows(stored: unknown, options: readonly IntegrationOption[]): IntegrationRow[] {
  const map = integrationsOf(stored);
  const known = new Set(options.map((option) => option.key));
  return [
    ...options.map((option) => ({ ...option, on: map[option.key] === true, known: true })),
    ...Object.keys(map).filter((key) => !known.has(key)).sort().map((key) => ({ key, name: key, on: map[key] === true, known: false })),
  ];
}

/**
 * The integrations after one was switched; every other stored key stays as it is. The whole map is written (the key may hold
 * anything, so no field path is built from it): another session's change of another key between opening and saving is lost. A key that was not stored when the form
 * opened is removed again when it is switched back off, so that nothing has changed then.
 */
export function withIntegration(current: unknown, before: unknown, key: string, on: boolean): Record<string, boolean> {
  const next = { ...integrationsOf(current), [key]: on };
  if (!on && integrationsOf(before)[key] === undefined) delete next[key];
  return next as Record<string, boolean>;
}

/** The names of the additional processors, as the platform form lists them; an entry without a name shows its key. */
export function processorNames(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  return stored.map((entry: Partial<ProcessorEntry> | null) => String(entry?.name || entry?.key || '')).filter((name) => name !== '');
}
