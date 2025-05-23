import { CategoryModel, TransferState } from '@bk2/shared/models';

export type TransferStateCategory = CategoryModel;

export const TransferStates: TransferStateCategory[] = [
  {
    id: TransferState.Initial,
    abbreviation: 'INIT',
    name: 'initial',
    i18nBase: 'transfer.state.initial',
    icon: 'bulb_idea'
  },
  {
    id: TransferState.Draft,
    abbreviation: 'APLD',
    name: 'applied',
    i18nBase: 'transfer.state.draft',
    icon: 'login_enter'
  },
  {
    id: TransferState.InProgress,
    abbreviation: 'ACTV',
    name: 'active',
    i18nBase: 'transfer.state.inprogress',
    icon: 'thumbs-up'
  },
  {
    id: TransferState.Completed,
    abbreviation: 'TERM',
    name: 'terminated',
    i18nBase: 'transfer.state.completed',
    icon: 'stop-circle'
  },
  {
    id: TransferState.Cancelled,
    abbreviation: 'CNCL',
    name: 'cancelled',
    i18nBase: 'transfer.state.cancelled',
    icon: 'close_cancel_circle'
  }
]


