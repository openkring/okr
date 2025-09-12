import { CategoryModel, TaskState } from '@bk2/shared-models';

export type TaskStateCategory = CategoryModel;

export const TaskStates: TaskStateCategory[] = [
    {
        id: TaskState.Initial,
        abbreviation: 'INIL',
        name: 'initial',
        i18nBase: 'task.state.initial',
        icon: 'bulb_idea'
    },
    {
        id: TaskState.Planned,
        abbreviation: 'PLND',
        name: 'planned',
        i18nBase: 'task.state.planned',
        icon: 'target'
    },
    {
        id: TaskState.Doing,
        abbreviation: 'DOIN',
        name: 'doing',
        i18nBase: 'task.state.doing',
        icon: 'cog'
    },
    {
        id: TaskState.Done,
        abbreviation: 'DONE',
        name: 'done',
        i18nBase: 'task.state.done',
        icon: 'checkbox'
    },
    {
        id: TaskState.Waiting,
        abbreviation: 'WAIT',
        name: 'waiting',
        i18nBase: 'task.state.waiting',
        icon: 'ellipsis-horizontal'
    },
    {
      id: TaskState.Cancelled,
      abbreviation: 'CNCL',
      name: 'cancelled',
      i18nBase: 'task.state.cancelled',
      icon: 'close_cancel'
  },
    {
        id: TaskState.Later,
        abbreviation: 'LATR',
        name: 'later',
        i18nBase: 'task.state.later',
        icon: 'chevron-forward'
    }
]

