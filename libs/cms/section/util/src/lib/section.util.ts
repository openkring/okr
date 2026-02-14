import { ALBUM_SECTION_SHAPE, AlbumSection, ARTICLE_SECTION_SHAPE, ArticleSection, BUTTON_SECTION_SHAPE, ButtonAction, ButtonSection, CAL_SECTION_SHAPE, CalendarSection, CHART_SECTION_SHAPE, ChartSection, CHAT_SECTION_SHAPE, ChatSection, ColorIonic, EVENTS_SECTION_SHAPE, EventsSection, GALLERY_SECTION_SHAPE, GallerySection, HERO_SECTION_SHAPE, HeroSection, IFRAME_SECTION_SHAPE, IframeSection, INVITATIONS_SECTION_SHAPE, InvitationsSection, MAP_SECTION_SHAPE, MapSection, PEOPLE_SECTION_SHAPE, PeopleSection, SectionModel, SectionType, SLIDER_SECTION_SHAPE, SliderSection, TABLE_SECTION_SHAPE, TableSection, TRACKER_SECTION_SHAPE, TrackerSection, VIDEO_SECTION_SHAPE, VideoSection, ViewPosition } from '@bk2/shared-models';
import { die } from '@bk2/shared-util-core';

/**
 * Convenience function to create a new SectionModel with given values.
 * @param type
 * @param tenantId
 * @param name
 * @returns 
 */
export function createSection(type: SectionType, tenantId: string): SectionModel {
  let section: SectionModel;
  switch (type) {
    case 'album': section = { ...ALBUM_SECTION_SHAPE } as AlbumSection; break;
    case 'article': 
      section = { ...ARTICLE_SECTION_SHAPE } as ArticleSection; 
      section.content.position = ViewPosition.Top;
      break;
    case 'button': 
      section = { ...BUTTON_SECTION_SHAPE } as ButtonSection; 
      section.content.position = ViewPosition.Left;
      section.properties.action.type = ButtonAction.Download;
      break;
    case 'cal': section = { ...CAL_SECTION_SHAPE } as CalendarSection; break;
    case 'chart': section = { ...CHART_SECTION_SHAPE } as ChartSection; break;
    case 'chat': section = { ...CHAT_SECTION_SHAPE } as ChatSection; break;
    case 'gallery': section = { ...GALLERY_SECTION_SHAPE } as GallerySection; break;
    case 'hero': section = { ...HERO_SECTION_SHAPE } as HeroSection; break;
    case 'iframe': section = { ...IFRAME_SECTION_SHAPE } as IframeSection; break;
    case 'map': section = { ...MAP_SECTION_SHAPE } as MapSection; break;
    case 'people': section = { ...PEOPLE_SECTION_SHAPE } as PeopleSection; break;
    case 'slider': section = { ...SLIDER_SECTION_SHAPE } as SliderSection; break;
    case 'table': section = { ...TABLE_SECTION_SHAPE } as TableSection; break;
    case 'tracker': section = { ...TRACKER_SECTION_SHAPE } as TrackerSection; break;
    case 'video': section = { ...VIDEO_SECTION_SHAPE } as VideoSection; break;
    case 'events': section = { ...EVENTS_SECTION_SHAPE } as EventsSection; break;
    case 'invitations': section = { ...INVITATIONS_SECTION_SHAPE } as InvitationsSection; break;
    default: 
      die(`section.util.createSection: unknown section type '${type}'`);
  }
  section.tenants = [tenantId];
  section.color = ColorIonic.Primary;
  section.roleNeeded = 'contentAdmin';
  section.index = getSectionIndex(section);
  return section;
}

export function narrowSection(section: any): SectionModel | undefined {
  switch (section.type) {
    case 'album': return section as AlbumSection;
    case 'article': return section as ArticleSection;
    case 'button': return section as ButtonSection;
    case 'cal': return section as CalendarSection;
    case 'chart': return section as ChartSection;
    case 'chat': return section as ChatSection;
    case 'gallery': return section as GallerySection;
    case 'hero': return section as HeroSection;
    case 'iframe': return section as IframeSection;
    case 'map': return section as MapSection;
    case 'people': return section as PeopleSection;
    case 'slider': return section as SliderSection;
    case 'table': return section as TableSection;
    case 'tracker': return section as TrackerSection;
    case 'video': return section as VideoSection;
    case 'events': return section as EventsSection;
    case 'invitations': return section as InvitationsSection;
    default: return undefined;
  }
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given section based on its values.
 * @param section the section for which to create the index
 * @returns the index string
 */
export function getSectionIndex(section: SectionModel): string {
  return 'n:' + section.name + ' t:' + section.type;
}

export function getSectionIndexInfo(): string {
  return 'n:name t:type';
}