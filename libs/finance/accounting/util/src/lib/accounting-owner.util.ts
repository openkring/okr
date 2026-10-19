import { AccountingConfigModel, OrgModel, PersonModel } from '@okr/shared-models';
import { getFullName } from '@okr/shared-util-core';

/** The model types that may own a set of books (spec 1.105 amendment). */
export type AccountingOwnerType = 'org' | 'person';

export interface AccountingOwnerRef {
  modelType: AccountingOwnerType;
  key: string;
}

const OWNER_TYPES: readonly AccountingOwnerType[] = ['org', 'person'];

/**
 * Splits a books owner `'org.<okey>'` / `'person.<okey>'` into its model type and okey.
 * Undefined for '' (no owner), an unknown prefix, a bare okey without prefix, or an empty key.
 */
export function parseOwnerKey(ownerKey: string | undefined): AccountingOwnerRef | undefined {
  if (!ownerKey) return undefined;
  const dot = ownerKey.indexOf('.');
  if (dot < 0) return undefined;
  const modelType = ownerKey.slice(0, dot) as AccountingOwnerType;
  const key = ownerKey.slice(dot + 1);
  if (!OWNER_TYPES.includes(modelType) || !key) return undefined;
  return { modelType, key };
}

/** The ownerKey of books owned by the org `orgKey`. */
export function orgOwnerKey(orgKey: string): string {
  return 'org.' + orgKey;
}

/** The ownerKey of books owned by the person `personKey`. */
export function personOwnerKey(personKey: string): string {
  return 'person.' + personKey;
}

/**
 * The books owner of a config as stored (`ownerKey`), else '' (no owner — never the tenant id or
 * app-config ownerOrgId: accountingTenantId ≠ tenantId). Every reader of the owner goes through here.
 */
export function resolveOwnerKey(config: Partial<Pick<AccountingConfigModel, 'ownerKey'>> | undefined): string {
  return config?.ownerKey ?? '';
}

/**
 * The printed name of a books owner: the org's name or the person's full name. '' for no owner, an
 * invalid key, or an owner whose document is not loaded — a report never prints a raw okey.
 */
export function ownerDisplayName(
  ownerKey: string,
  getOrg: (key: string) => OrgModel | undefined,
  getPerson: (key: string) => PersonModel | undefined,
): string {
  const owner = parseOwnerKey(ownerKey);
  if (!owner) return '';
  if (owner.modelType === 'org') return getOrg(owner.key)?.name ?? '';
  const person = getPerson(owner.key);
  return person ? getFullName(person.firstName, person.lastName) : '';
}
