import { CategoryModel, DeliveryState } from '@bk2/shared-models';

export type DeliveryStateCategory = CategoryModel;

export const DeliveryStates: DeliveryStateCategory[] = [
    {
        id: DeliveryState.Created,
        abbreviation: 'CREA',
        name: 'created',
        i18nBase: 'delivery.state.created',
        icon: 'checkmark'
    },
    {
        id: DeliveryState.ReadyToReview,
        abbreviation: 'RTR',
        name: 'readyToReview',
        i18nBase: 'delivery.state.readyToReview',
        icon: 'checkbox'
    },
    {
        id: DeliveryState.ReadyToSend,
        abbreviation: 'RTS',
        name: 'readyToSend',
        i18nBase: 'delivery.state.readyToSend',
        icon: 'mail'
    },
    {
        id: DeliveryState.Sent,
        abbreviation: 'SENT',
        name: 'sent',
        i18nBase: 'delivery.state.sent',
        icon: 'email'
    },
    {
        id: DeliveryState.Completed,
        abbreviation: 'FIN',
        name: 'completed',
        i18nBase: 'delivery.state.completed',
        icon: 'checkmark-done'
    },
    {
        id: DeliveryState.Archived,
        abbreviation: 'ARCH',
        name: 'archived',
        i18nBase: 'delivery.state.archived',
        icon: 'archive'
    }
]
