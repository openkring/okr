import { BaseProperty, BaseType } from '@okr/shared-models';

// Keys of LocationModel.properties that the code relies on (spec 1.136).
export const LOCATION_PROPERTY_BFS_NR = 'bfsNr';
// Written only by the energy-figures job: why a location has no municipal data. Absent means no problem is known.
export const LOCATION_PROPERTY_BFS_STATUS = 'bfsStatus';
export const LOCATION_BFS_STATUS_NONE = 'none';

type WithProperties = { properties?: BaseProperty[] };

/** Reads one property. Legacy documents have no `properties` (Firestore reads skip model defaults), hence the coalesce. */
export function getLocationProperty(location: WithProperties, key: string): BaseType | undefined {
  return (location.properties ?? []).find((p) => p.key === key)?.value;
}

/** The BFS number of a location, or undefined when it is missing or not a whole number. The form stores it as a string. */
export function getBfsNr(location: WithProperties): number | undefined {
  const value = getLocationProperty(location, LOCATION_PROPERTY_BFS_NR);
  if (typeof value === 'boolean' || value === undefined) return undefined;
  const text = String(value).trim();
  if (text === '') return undefined;
  const nr = Number(text);
  return Number.isInteger(nr) ? nr : undefined;
}

/** Returns a new list with the key set or replaced; `undefined` removes it. The input is not mutated. */
export function setLocationProperty(properties: BaseProperty[] | undefined, key: string, value: BaseType | undefined): BaseProperty[] {
  const current = properties ?? [];
  if (value === undefined) return current.filter((p) => p.key !== key);
  if (!current.some((p) => p.key === key)) return [...current, { key, value }];
  return current.map((p) => (p.key === key ? { key, value } : p));
}
