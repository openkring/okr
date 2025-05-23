import { CategoryModel, InvoicePositionType } from "@bk2/shared/models";

export type InvoicePositionTypeCategory = CategoryModel;


export const InvoicePositionTypes: InvoicePositionTypeCategory[] = [
    {
        id: InvoicePositionType.Fix,
        abbreviation: 'FIX',
        name: 'fix',
        i18nBase: 'delivery.position.type.fix',
        icon: 'location'
    },
    {
        id: InvoicePositionType.Unit,
        abbreviation: 'UNIT',
        name: 'unit',
        i18nBase: 'delivery.position.type.unit',
        icon: 'cellular'
    },
    {
        id: InvoicePositionType.Hours,
        abbreviation: 'HRS',
        name: 'hours',
        i18nBase: 'delivery.position.type.hours',
        icon: 'alarm'
    },
    {
        id: InvoicePositionType.Days,
        abbreviation: 'DAYS',
        name: 'days',
        i18nBase: 'delivery.position.type.days',
        icon: 'calendar-number'
    },
    {
        id: InvoicePositionType.Deduction,
        abbreviation: 'DED',
        name: 'deduction',
        i18nBase: 'delivery.position.type.deduction',
        icon: 'remove-circle'
    },
    {
        id: InvoicePositionType.Rebate,
        abbreviation: 'REB',
        name: 'rebate',
        i18nBase: 'delivery.position.type.rebate',
        icon: 'finance_cash_note'
    }
]
