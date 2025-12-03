import { AddressModel, AddressUsage, OrgModel } from '@bk2/shared-models';
import { addIndexElement, die } from '@bk2/shared-util-core';
import { DEFAULT_CITY, DEFAULT_COUNTRY, DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_PHONE, DEFAULT_STREETNAME, DEFAULT_STREETNUMBER, DEFAULT_TAGS, DEFAULT_URL, DEFAULT_ZIP } from '@bk2/shared-constants';

import { createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoritePostalAddress, createFavoriteWebAddress } from '@bk2/subject-address-util';

import { OrgFormModel } from './org-form.model';
import { OrgNewFormModel } from './org-new-form.model';

/*-------------------------- ORG --------------------------------*/
export function convertOrgToForm(org?: OrgModel): OrgFormModel | undefined {
  if (!org) return undefined;
  return {
    bkey: org.bkey ?? DEFAULT_KEY,
    name: org.name ?? DEFAULT_NAME,
    type: org.type ?? DEFAULT_ORG_TYPE,
    dateOfFoundation: org.dateOfFoundation ?? DEFAULT_DATE,
    dateOfLiquidation: org.dateOfLiquidation ?? DEFAULT_DATE,
    membershipCategoryKey: org.membershipCategoryKey ?? 'mcat_default',
    taxId: org.taxId ?? DEFAULT_ID,
    bexioId: org.bexioId ?? DEFAULT_ID,
    tags: org.tags ?? DEFAULT_TAGS,
    notes: org.notes ?? DEFAULT_NOTES,
  };
}

export function convertFormToOrg(vm?: OrgFormModel, org?: OrgModel): OrgModel {
  if (!org) die('org.util.convertFormToOrg: org is mandatory.');
  if (!vm) return org;
  
  org.bkey = vm.bkey ?? DEFAULT_KEY;
  org.name = vm.name ?? DEFAULT_NAME;
  org.type = vm.type ?? DEFAULT_ORG_TYPE;
  org.dateOfFoundation = vm.dateOfFoundation ?? DEFAULT_DATE;
  org.dateOfLiquidation = vm.dateOfLiquidation ?? DEFAULT_DATE;
  org.membershipCategoryKey = vm.membershipCategoryKey ?? 'mcat_default';
  org.taxId = vm.taxId ?? DEFAULT_ID;
  org.notes = vm.notes ?? DEFAULT_NOTES;
  org.bexioId = vm.bexioId ?? DEFAULT_ID;
  org.tags = vm.tags ?? DEFAULT_TAGS;
  return org;
}

/*-------------------------- NEW ORG --------------------------------*/
export function convertFormToNewOrg(vm: OrgNewFormModel, tenantId: string): OrgModel {
  const org = new OrgModel(tenantId);
  org.bkey = DEFAULT_KEY;
  org.name = vm.name ?? DEFAULT_NAME;
  org.type = vm.type ?? DEFAULT_ORG_TYPE;
  org.dateOfFoundation = vm.dateOfFoundation ?? DEFAULT_DATE;
  org.dateOfLiquidation = vm.dateOfLiquidation ?? DEFAULT_DATE;
  org.taxId = vm.taxId ?? DEFAULT_ID;
  org.notes = vm.notes ?? DEFAULT_NOTES;
  org.bexioId = vm.bexioId ?? DEFAULT_ID;
  org.tags = vm.tags ?? DEFAULT_TAGS;

  org.favEmail = vm.email ?? DEFAULT_EMAIL;
  org.favPhone = vm.phone ?? DEFAULT_PHONE;
  org.favStreetName = vm.streetName ?? DEFAULT_STREETNAME;
  org.favStreetNumber = vm.streetNumber ?? DEFAULT_STREETNUMBER;
  org.favZipCode = vm.zipCode ?? DEFAULT_ZIP;
  org.favCity = vm.city ?? DEFAULT_CITY;
  org.favCountryCode = vm.countryCode ?? DEFAULT_COUNTRY;
  return org;
}

export function convertNewOrgFormToEmailAddress(vm: OrgNewFormModel, tenantId: string): AddressModel {
  return createFavoriteEmailAddress(AddressUsage.Work, vm.email ?? DEFAULT_EMAIL, tenantId);
}

export function convertNewOrgFormToPhoneAddress(vm: OrgNewFormModel, tenantId: string): AddressModel {
  return createFavoritePhoneAddress(AddressUsage.Work, vm.phone ?? DEFAULT_PHONE, tenantId);
}

export function convertNewOrgFormToWebAddress(vm: OrgNewFormModel, tenantId: string): AddressModel {
  return createFavoriteWebAddress(AddressUsage.Work, vm.url ?? DEFAULT_URL, tenantId);
}

export function convertNewOrgFormToPostalAddress(vm: OrgNewFormModel, tenantId: string): AddressModel {
  return createFavoritePostalAddress(AddressUsage.Work, vm.streetName ?? DEFAULT_STREETNAME, vm.streetNumber ?? DEFAULT_STREETNUMBER, vm.zipCode ?? DEFAULT_ZIP, vm.city ?? DEFAULT_CITY, vm.countryCode ?? DEFAULT_COUNTRY, tenantId);
}


/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given organization based on its values.
 * @param org the organization to generate the index for 
 * @returns the index string
 */
export function getOrgIndex(org: OrgModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'n', org.name);
  _index = addIndexElement(_index, 'c', org.favCity);
  _index = addIndexElement(_index, 'ot', org.type);
  _index = addIndexElement(_index, 'dof', org.dateOfFoundation);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getOrgIndexInfo(): string {
  return 'n:name c:city ot:orgType dof:dateOfFoundation';
}