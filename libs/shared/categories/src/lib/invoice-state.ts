import { CategoryModel, InvoiceState } from '@bk2/shared-models';

export type InvoiceStateCategory = CategoryModel;

export const InvoiceStates: InvoiceStateCategory[] = [
    {
        id: InvoiceState.Created,
        abbreviation: 'CRTD',
        name: 'created',
        i18nBase: 'finance.invoice.state.created',
        icon: 'checkmark-done-circle'
    },
    {
        id: InvoiceState.Synched,
        abbreviation: 'SYNC',
        name: 'synched',
        i18nBase: 'finance.invoice.state.synched',
        icon: 'sync-circle'
    },
    {
        id: InvoiceState.Free,
        abbreviation: 'FREE',
        name: 'free',
        i18nBase: 'finance.invoice.state.free',
        icon: 'free'
    },
    {
        id: InvoiceState.Billed,
        abbreviation: 'BLLD',
        name: 'billed',
        i18nBase: 'finance.invoice.state.billed',
        icon: 'finance_document_invoice_bill'
    },
    {
        id: InvoiceState.Reminded,
        abbreviation: 'RMND',
        name: 'reminded',
        i18nBase: 'finance.invoice.state.reminded',
        icon: 'alert-circle'
    },
    {
        id: InvoiceState.Paid,
        abbreviation: 'PAID',
        name: 'paid',
        i18nBase: 'finance.invoice.state.paid',
        icon: 'checkbox-circle'
    },
    {
        id: InvoiceState.Closed,
        abbreviation: 'CLSD',
        name: 'closed',
        i18nBase: 'finance.invoice.state.closed',
        icon: 'close_cancel_circle'
    },
    {
        id: InvoiceState.Cancelled,
        abbreviation: 'CNCL',
        name: 'cancelled',
        i18nBase: 'finance.invoice.state.cancelled',
        icon: 'close_cancel'
    }
]

