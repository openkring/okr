import { CategoryModel, InvoicePositionUsage } from '@bk2/shared-models';

export type InvoicePositionUsageCategory = CategoryModel;

export const InvoicePositionUsages: InvoicePositionUsageCategory[] = [
    {
        id: InvoicePositionUsage.MembershipFee,
        abbreviation: 'MBRF',
        name: 'membershipFee',
        i18nBase: 'finance.invoicePosition.type.membershipFee',
        icon: 'checkmark-done-circle'
    },
    {
        id: InvoicePositionUsage.Beverages,
        abbreviation: 'BEVG',
        name: 'beverages',
        i18nBase: 'finance.invoicePosition.type.beverages',
        icon: 'document-text'
    },
    {
        id: InvoicePositionUsage.Insurance,
        abbreviation: 'INSU',
        name: 'insurance',
        i18nBase: 'finance.invoicePosition.type.insurance',
        icon: 'alert-circle'
    },
    {
        id: InvoicePositionUsage.LockerRental,
        abbreviation: 'LCKR',
        name: 'lockerRental',
        i18nBase: 'finance.invoicePosition.type.lockerRental',
        icon: 'lock-closed'
    },
    {
        id: InvoicePositionUsage.BoatPlaceRental,
        abbreviation: 'BOAT',
        name: 'boatPlaceRental',
        i18nBase: 'finance.invoicePosition.type.boatPlaceRental',
        icon: 'rowing_1x_top'
    },
    {
        id: InvoicePositionUsage.License,
        abbreviation: 'LICF',
        name: 'license',
        i18nBase: 'finance.invoicePosition.type.license',
        icon: 'id-card'
    },
    {
        id: InvoicePositionUsage.SrvFee,
        abbreviation: 'SRVF',
        name: 'srvFee',
        i18nBase: 'finance.invoicePosition.type.srvFee',
        icon: 'srv'
    },
    {
        id: InvoicePositionUsage.Other,
        abbreviation: 'OTHR',
        name: 'other',
        i18nBase: 'finance.invoicePosition.type.other',
        icon: 'other'
    }
]
