import { CategoryModel, TransferType } from '@bk2/shared-models';

export type TransferTypeCategory = CategoryModel;

export const TransferTypes: TransferTypeCategory[] = [
  {
    id: TransferType.Purchase,
    abbreviation: 'PURCH',
    name: 'purchase',
    i18nBase: 'transfer.type.purchase',
    icon: 'transfer'
  },
  {
    id: TransferType.Gift,
    abbreviation: 'GIFT',
    name: 'gift',
    i18nBase: 'transfer.type.gift',
    icon: 'transfer'
  },
  {
    id: TransferType.Inheritance,
    abbreviation: 'INHR',
    name: 'inheritance',
    i18nBase: 'transfer.type.inheritance',
    icon: 'transfer'
  },
  {
    id: TransferType.Withdrawal,
    abbreviation: 'WDRW',
    name: 'withdrawal',
    i18nBase: 'transfer.type.withdrawal',
    icon: 'transfer'
  },
  {
    id: TransferType.Deposit,
    abbreviation: 'DEPS',
    name: 'deposit',
    i18nBase: 'transfer.type.deposit',
    icon: 'transfer'
  },
  {
    id: TransferType.Loan,
    abbreviation: 'LOAN',
    name: 'loan',
    i18nBase: 'transfer.type.loan',
    icon: 'transfer'
  },
  {
    id: TransferType.Custom,
    abbreviation: 'CUST',
    name: 'custom',
    i18nBase: 'transfer.type.custom',
    icon: 'transfer'
  },
  {
    id: TransferType.Booking,
    abbreviation: 'BOOK',
    name: 'booking',
    i18nBase: 'transfer.type.booking',
    icon: 'transfer'
  }
];