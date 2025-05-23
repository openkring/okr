/**
 * later interfaces:
 * Alerter
 * Cloneable
 * Creatable
 * Exporter
 * Importer
 * Modifiable
 * Pictured
 * Printable
 */

import { Roles } from "./roles";

// this is how the models are stored in the database (Firestore Document ID instead of bkey)
export interface PersistedModel {
  tenants: string[];
  isArchived: boolean;
}

// for models in the application, we add the Firestore Document ID as bkey
export interface BkModel extends PersistedModel {
  bkey: string;
}

export interface NamedModel {
  name: string;
}

export interface TaggedModel {
  tags: string;
}

export interface SearchableModel {
  index: string;
}

export interface AddressableModel {
  fav_email: string;
  fav_phone: string;
  fav_street: string;
  fav_zip: string;
  fav_city: string;
  fav_country: string;
}

export type BaseType = string | number | boolean;
export type BaseProperty = { key: string, value: BaseType };
export type PropertyList = Map<string, BaseType>;
// add a new property to the list:  params.set('key', 'value');
// get a property from the list: params.get('key');
// check whether a key exists:    params.has('key');
// remove a property from the list: params.delete('key');
// keys() returns an iterator for the keys
// values() returns an iterator for the values

export type MetaTag = { name: string, content: string};


export interface FieldDescription {
  name: string;
  label: string;
  value?: boolean | string | number | Roles;
}

export function isBaseModel(obj: unknown): obj is BkModel {
  return typeof obj === 'object' && obj !== null && 'bkey' in obj;
}

export function isNamedModel(obj: unknown): obj is NamedModel {
  return typeof obj === 'object' && obj !== null && 'name' in obj;
}

export function isTaggedModel(obj: unknown): obj is TaggedModel {
  return typeof obj === 'object' && obj !== null && 'tags' in obj;
}

export function isSearchableModel(obj: unknown): obj is SearchableModel {
  return typeof obj === 'object' && obj !== null && 'index' in obj;
}

export function isAddressableModel(obj: unknown): obj is AddressableModel {
  return typeof obj === 'object' && obj !== null && 'fav_email' in obj && 'fav_phone' in obj && 'fav_street' in obj && 'fav_zip' in obj && 'fav_city' in obj && 'fav_country' in obj;
}

export function isPersistedModel(obj: unknown): obj is PersistedModel {
  return typeof obj === 'object' && obj !== null && 'tenants' in obj && 'isArchived' in obj;
}