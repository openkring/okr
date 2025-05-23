import { CategoryModel, ContentType } from "@bk2/shared/models";

export interface ContentTypeCategory extends CategoryModel {
    isSection: boolean;
    isPage: boolean;
}

export const ContentTypes: ContentTypeCategory[] = [
  {
    id: ContentType.Article,
    abbreviation: 'ART',
    name: 'article',
    i18nBase: 'content.type.article',
    icon: 'document_text',
    isSection: true,
    isPage: false
  },
  {
    id: ContentType.Category,
    abbreviation: 'CAT',
    name: 'category',
    i18nBase: 'content.type.category',
    icon: 'tag',
    isSection: false,
    isPage: false
  },
  {
    id: ContentType.Footer,
    abbreviation: 'FTR',
    name: 'footer',
    i18nBase: 'content.type.footer',
    icon: 'download',
    isSection: true,
    isPage: false
  },
  {
    id: ContentType.Help,
    abbreviation: 'HELP',
    name: 'help',
    i18nBase: 'content.type.help',
    icon: 'help-circle',
    isSection: false,
    isPage: true
  },
  {
    id: ContentType.Hero,
    abbreviation: 'HERO',
    name: 'hero',
    i18nBase: 'content.type.hero',
    icon: 'alert-circle',
    isSection: true,
    isPage: false
  },
  {
    id: ContentType.Link,
    abbreviation: 'LINK',
    name: 'link',
    i18nBase: 'content.type.link',
    icon: 'link',
    isSection: false,
    isPage: false
  },
  { 
    id: ContentType.Page,
    abbreviation: 'PAGE',
    name: 'page',
    i18nBase: 'content.type.page',
    icon: 'newspaper',
    isSection: false,
    isPage: true
  },
  {
    id: ContentType.Picture,
    abbreviation: 'PICT',
    name: 'picture',
    i18nBase: 'content.type.picture',
    icon: 'instagram',
    isSection: false,
    isPage: false
  },
  {
    id: ContentType.TextBlock,
    abbreviation: 'TXTB',
    name: 'textblock',
    i18nBase: 'content.type.textblock',
    icon: 'create-edit',
    isSection: true,
    isPage: false
  }
]
