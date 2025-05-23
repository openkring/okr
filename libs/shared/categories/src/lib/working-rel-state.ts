import { CategoryModel, WorkingRelState } from '@bk2/shared/models';

export type WorkingRelStateCategory = CategoryModel;

export const WorkingRelStates: WorkingRelStateCategory[] = [
  {
    id: WorkingRelState.Initial,
    abbreviation: 'INIT',
    name: 'initial',
    i18nBase: 'workingRel.state.initial',
    icon: 'bulb_idea'
  },
  {
    id: WorkingRelState.Applied,
    abbreviation: 'APLD',
    name: 'applied',
    i18nBase: 'workingRel.state.applied',
    icon: 'login_enter'
  },
  {
    id: WorkingRelState.Active,
    abbreviation: 'ACTV',
    name: 'active',
    i18nBase: 'workingRel.state.active',
    icon: 'thumbs-up'
  },
  {
    id: WorkingRelState.Passive,
    abbreviation: 'PSSV',
    name: 'passive',
    i18nBase: 'workingRel.state.passive',
    icon: 'checkmark'
  },
  {
    id: WorkingRelState.Terminated,
    abbreviation: 'TERM',
    name: 'terminated',
    i18nBase: 'workingRel.state.terminated',
    icon: 'close_cancel'
  },
  {
    id: WorkingRelState.Cancelled,
    abbreviation: 'CNCL',
    name: 'cancelled',
    i18nBase: 'workingRel.state.cancelled',
    icon: 'thumbs-down'
  }
]