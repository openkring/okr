import { CategoryModel, ContentState } from '@bk2/shared-models';

export type ContentStateCategory = CategoryModel;

export const ContentStates: ContentStateCategory[] = [   
  {
      id: ContentState.Draft,
      abbreviation: 'DRFT',
      name: 'draft',
      i18nBase: 'content.page.state.draft',
      icon: 'create_edit'
  },
  {
    id: ContentState.InReview,
    abbreviation: 'IRVW',
    name: 'inreview',
    i18nBase: 'content.page.state.inReview',
    icon: 'eye-on'
  },
  {
    id: ContentState.Published,
    abbreviation: 'PUBL',
    name: 'published',
    i18nBase: 'content.page.state.published',
    icon: 'active'
  },
  {
    id: ContentState.Decommitted,
    abbreviation: 'DECOM',
    name: 'decommitted',
    i18nBase: 'content.page.state.decommitted',
    icon: 'warning'
  },
  {
    id: ContentState.Archived,
    abbreviation: 'ARCH',
    name: 'archived',
    i18nBase: 'content.page.state.archived',
    icon: 'archive'
  }
]