import { CategoryModel, SectionType } from '@bk2/shared/models';

export type SectionTypeCategory = CategoryModel;

export const SectionTypes: SectionTypeCategory[] = [
  {
    id: SectionType.Album,
    abbreviation: 'ALBUM',
    name: 'album',
    i18nBase: 'content.type.album',
    icon: 'images'
  }, 
  {
    id: SectionType.Article,
    abbreviation: 'ARTCL',
    name: 'article',
    i18nBase: 'content.type.article',
    icon: 'newspaper_page'
  },
  {
    id: SectionType.Chart,
    abbreviation: 'CHART',
    name: 'chart',
    i18nBase: 'content.type.chart',
    icon: 'chart-bar'
  },
  {
    id: SectionType.Gallery,
    abbreviation: 'GLRY',
    name: 'gallery',
    i18nBase: 'content.type.gallery',
    icon: 'gallery'
  },
  {
    id: SectionType.Hero,
    abbreviation: 'HERO',
    name: 'hero',
    i18nBase: 'content.type.hero',
    icon: 'panorama'
  },
  {
    id: SectionType.Map,
    abbreviation: 'MAP',
    name: 'map',
    i18nBase: 'content.type.map',
    icon: 'map'
  },
  {
    id: SectionType.PeopleList,
    abbreviation: 'PPLL',
    name: 'peopleList',
    i18nBase: 'content.type.peopleList',
    icon: 'peoplelist'
  },
  {
    id: SectionType.Slider,
    abbreviation: 'SLIDER',
    name: 'slider',
    i18nBase: 'content.type.slider',
    icon: 'slider'
  },
  {
    id: SectionType.Video,
    abbreviation: 'VIDEO',
    name: 'video',
    i18nBase: 'content.type.video',
    icon: 'video'
  },
  {
    id: SectionType.Calendar,
    abbreviation: 'CAL',
    name: 'calendar',
    i18nBase: 'content.type.calendar',
    icon: 'calendar'
  },
  {
    id: SectionType.Button,
    abbreviation: 'BTN',
    name: 'button',
    i18nBase: 'content.type.button',
    icon: 'button'
  },
  {
    id: SectionType.Table,
    abbreviation: 'TBL',
    name: 'table',
    i18nBase: 'content.type.table',
    icon: 'table'
  },
  {
    id: SectionType.Iframe,
    abbreviation: 'IFR',
    name: 'iframe',
    i18nBase: 'content.type.iframe',
    icon: 'browser'
  },
  { 
    id: SectionType.Chat,
    abbreviation: 'CHAT',
    name: 'chat_stream',
    i18nBase: 'content.type.chat',
    icon: 'chatbubbles'
  },
  { 
    id: SectionType.Tracker,
    abbreviation: 'TRCKR',
    name: 'tracker',
    i18nBase: 'content.type.tracker',
    icon: 'analytics_track'
  }
];

/**
  not yet implemented:
  
    { 
    id: SectionType.Accordion, -> should probably be a page type
    abbreviation: 'ACCR',
    name: 'accordion',
    i18nBase: 'content.type.accordion',
    icon: 'chevron-forward'
  },
  model
  meet
  
 */