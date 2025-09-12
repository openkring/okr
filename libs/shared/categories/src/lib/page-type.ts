import { CategoryModel, PageType } from '@bk2/shared-models';

export type PageTypeCategory = CategoryModel;

export const PageTypes: PageTypeCategory[] = [
  {
    id: PageType.Accordion,
    abbreviation: 'ACC',
    name: 'accordion',
    i18nBase: 'content.page.type.accordion',
    icon: 'accordion',
  },
  {
    id: PageType.Album,
    abbreviation: 'ALBM',
    name: 'album',
    i18nBase: 'content.page.type.album',
    icon: 'gallery',
  },
  {
    id: PageType.Blog,
    abbreviation: 'BLOG',
    name: 'blog',
    i18nBase: 'content.page.type.blog',
    icon: 'newspaper_page',
  },
  {
    id: PageType.Content,
    abbreviation: 'CONT',
    name: 'content',
    i18nBase: 'content.page.type.content',
    icon: 'page',
  },
  {
    id: PageType.Dashboard,
    abbreviation: 'DBRD',
    name: 'dashboard',
    i18nBase: 'content.page.type.dashboard',
    icon: 'grid',
  },
  {
    id: PageType.Shop,
    abbreviation: 'SHOP',
    name: 'shop',
    i18nBase: 'content.page.type.shop',
    icon: 'finance_cart_shop',
  },
  {
    id: PageType.SearchResults,
    abbreviation: 'SRCH',
    name: 'search-results',
    i18nBase: 'content.page.type.searchResults',
    icon: 'search',
  },
];
