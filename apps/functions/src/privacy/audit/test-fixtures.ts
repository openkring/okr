import type { AppConfig } from '@okr/shared-models';
import type { AuditCtx, AuditDoc } from './types';

/**
 * Shared fixture builder for the check specs.
 *
 * Deliberately NOT in a `.spec.ts` file: importing one spec from another makes Vitest
 * execute its `describe` blocks a second time, which double-counted every Firestore check
 * inside the register suite.
 */
type Fixture = Record<string, Record<string, unknown>[]> & { config?: Partial<AppConfig> };

const toDocs = (rows: Record<string, unknown>[]): AuditDoc[] =>
  rows.map((row) => ({
    okey: String(row['okey'] ?? ''),
    data: row,
    // `updatedAt` mirrors the snapshot's server-side updateTime in production.
    updatedAt: row['updatedAt'] as number | undefined,
  }));

/**
 * The default config is a tenant that switched nothing on: no integrations, and
 * `enabledFeatures: []` — an absent field would read as a legacy doc running every
 * non-internal block, which activates the feature-gated register rows (YouTube).
 */
export const ctxWith = (data: Fixture): AuditCtx => ({
  tenantId: 'scs',
  config: { integrations: {}, enabledFeatures: [], additionalProcessors: [], privacyPolicyVersion: '', ...(data.config ?? {}) } as AppConfig,
  load: async (collection) => toDocs((data[collection] as Record<string, unknown>[]) ?? []),
  listCollections: async () => Object.keys(data).filter((k) => k !== 'config'),
});
