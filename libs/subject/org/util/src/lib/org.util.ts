import { AddressModel, AddressUsage, OrgModel, OrgType } from '@bk2/shared-models';

import { createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoritePostalAddress, createFavoriteWebAddress } from '@bk2/subject-address-util';

import { OrgFormModel } from './org-form.model';
import { OrgNewFormModel } from './org-new-form.model';

/*-------------------------- ORG --------------------------------*/
export function newOrgFormModel(): OrgFormModel {
  return {
    bkey: '',
    orgName: '',
    type: OrgType.Association,
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
    orgName: org.name ?? '',
    type: org.type ?? OrgType.Association,
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
  org.name = vm.orgName ?? '';
  org.type = vm.type ?? OrgType.Association;
  org.dateOfFoundation = vm.dateOfFoundation ?? '';
  org.dateOfLiquidation = vm.dateOfLiquidation ?? '';
  org.membershipCategoryKey = vm.membershipCategoryKey ?? 'mcat_default';
  org.taxId = vm.taxId ?? '';
  org.notes = vm.notes ?? '';
  org.bexioId = vm.bexioId ?? '';
  org.tags = vm.tags ?? '';
  return org;
}

export function getOrgNameByOrgType(orgType?: number): string {
  if (orgType === undefined) return '';
  switch (orgType) {
    case OrgType.Association:
      return 'orgName.association';
    case OrgType.Authority:
      return 'orgName.authority';
    case OrgType.LegalEntity:
      return 'orgName.company';
    default:
      return 'orgName';
  }
}

/*-------------------------- NEW ORG --------------------------------*/
export function createNewOrgFormModel(): OrgNewFormModel {
  return {
    orgName: '',
    type: OrgType.Association,
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
  org.name = vm.orgName ?? '';
  org.type = vm.type ?? OrgType.Association;
  org.dateOfFoundation = vm.dateOfFoundation ?? '';
  org.dateOfLiquidation = vm.dateOfLiquidation ?? '';
  org.taxId = vm.taxId ?? '';
  org.notes = vm.notes ?? '';
  org.bexioId = vm.bexioId ?? '';
  org.tags = vm.tags ?? '';

  org.fav_email = vm.email ?? '';
  org.fav_phone = vm.phone ?? '';
  org.fav_street_name = vm.streetName ?? '';
  org.fav_street_number = vm.streetNumber ?? '';
  org.fav_zip_code = vm.zipCode ?? '';
  org.fav_city = vm.city ?? '';
  org.fav_country_code = vm.countryCode ?? '';
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
