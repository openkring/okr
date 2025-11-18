import { AddressModel, AddressUsage, OrgModel } from '@bk2/shared-models';

import { createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoritePostalAddress, createFavoriteWebAddress } from '@bk2/subject-address-util';

import { OrgFormModel } from './org-form.model';
import { OrgNewFormModel } from './org-new-form.model';

/*-------------------------- ORG --------------------------------*/
export function newOrgFormModel(): OrgFormModel {
  return {
    bkey: '',
    name: '',
    type: 'association',
    dateOfFoundation: '',
    dateOfLiquidation: '',
    membershipCategoryKey: 'mcat_default',
    taxId: '',
    bexioId: '',
    tags: '',
    notes: '',
  };
}

export function convertOrgToForm(org?: OrgModel): OrgFormModel {
  if (!org) return {};
  return {
    bkey: org.bkey ?? '',
    name: org.name ?? '',
    type: org.type ?? 'association',
    dateOfFoundation: org.dateOfFoundation ?? '',
    dateOfLiquidation: org.dateOfLiquidation ?? '',
    membershipCategoryKey: org.membershipCategoryKey ?? 'mcat_default',
    taxId: org.taxId ?? '',
    bexioId: org.bexioId ?? '',
    tags: org.tags ?? '',
    notes: org.notes ?? '',
  };
}

export function convertFormToOrg(org: OrgModel | undefined, vm: OrgFormModel, tenantId: string): OrgModel {
  org ??= new OrgModel(tenantId);
  org.bkey = vm.bkey ?? '';
  org.name = vm.name ?? '';
  org.type = vm.type ?? 'association';
  org.dateOfFoundation = vm.dateOfFoundation ?? '';
  org.dateOfLiquidation = vm.dateOfLiquidation ?? '';
  org.membershipCategoryKey = vm.membershipCategoryKey ?? 'mcat_default';
  org.taxId = vm.taxId ?? '';
  org.notes = vm.notes ?? '';
  org.bexioId = vm.bexioId ?? '';
  org.tags = vm.tags ?? '';
  return org;
}

/*-------------------------- NEW ORG --------------------------------*/
export function createNewOrgFormModel(): OrgNewFormModel {
  return {
    name: '',
    type: 'association',
    dateOfFoundation: '',
    dateOfLiquidation: '',
    streetName: '',
    streetNumber: '',
    zipCode: '',
    city: '',
    countryCode: 'CH',
    phone: '',
    email: '',
    url: '',
    taxId: '',
    bexioId: '',
    membershipCategoryKey: 'mcat_default',
    tags: '',
    notes: '',
  };
}

export function convertFormToNewOrg(vm: OrgNewFormModel, tenantId: string): OrgModel {
  const org = new OrgModel(tenantId);
  org.bkey = '';
  org.name = vm.name ?? '';
  org.type = vm.type ?? 'association';
  org.dateOfFoundation = vm.dateOfFoundation ?? '';
  org.dateOfLiquidation = vm.dateOfLiquidation ?? '';
  org.taxId = vm.taxId ?? '';
  org.notes = vm.notes ?? '';
  org.bexioId = vm.bexioId ?? '';
  org.tags = vm.tags ?? '';

  org.favEmail = vm.email ?? '';
  org.favPhone = vm.phone ?? '';
  org.favStreetName = vm.streetName ?? '';
  org.favStreetNumber = vm.streetNumber ?? '';
  org.favZipCode = vm.zipCode ?? '';
  org.favCity = vm.city ?? '';
  org.favCountryCode = vm.countryCode ?? '';
  return org;
}

export function convertNewOrgFormToEmailAddress(vm: OrgNewFormModel, tenantId: string): AddressModel {
  return createFavoriteEmailAddress(AddressUsage.Work, vm.email ?? '', tenantId);
}

export function convertNewOrgFormToPhoneAddress(vm: OrgNewFormModel, tenantId: string): AddressModel {
  return createFavoritePhoneAddress(AddressUsage.Work, vm.phone ?? '', tenantId);
}

export function convertNewOrgFormToWebAddress(vm: OrgNewFormModel, tenantId: string): AddressModel {
  return createFavoriteWebAddress(AddressUsage.Work, vm.url ?? '', tenantId);
}

export function convertNewOrgFormToPostalAddress(vm: OrgNewFormModel, tenantId: string): AddressModel {
  return createFavoritePostalAddress(AddressUsage.Work, vm.streetName ?? '', vm.streetNumber ?? '', vm.zipCode ?? '', vm.city ?? '', vm.countryCode ?? '', tenantId);
}
