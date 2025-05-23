import { CategoryModel, ShipmentType } from '@bk2/shared/models';

export interface ShipmentTypeCategory extends CategoryModel {
    xsltTemplateUrl: string;
}

export const ShipmentTypes: ShipmentTypeCategory[] = [
    {
        id: ShipmentType.Letter,
        abbreviation: 'LETTER',
        name: 'letter',
        i18nBase: 'delivery.shipment.type.letter',
        icon: 'create_edit',
        xsltTemplateUrl: ''
    },
    {
        id: ShipmentType.AddressOnly,
        abbreviation: 'ADDR',
        name: 'addressOnly',
        i18nBase: 'delivery.shipment.type.addressOnly',
        icon: 'address',
        xsltTemplateUrl: ''
    },
    {
        id: ShipmentType.MembershipFee,
        abbreviation: 'MSHP',
        name: 'membershipFee',
        i18nBase: 'delivery.shipment.type.membershipFee',
        icon: 'membership',
        xsltTemplateUrl: ''
    },
    {
        id: ShipmentType.FreeInvoice,
        abbreviation: 'INV',
        name: 'freeInvoice',
        i18nBase: 'delivery.shipment.type.freeInvoice',
        icon: 'gifts',
        xsltTemplateUrl: ''
    }
]
