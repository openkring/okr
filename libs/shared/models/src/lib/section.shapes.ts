import { CalendarOptions } from "@fullcalendar/core";
import { EChartsOption } from "echarts";

import { BUTTON_HEIGHT, BUTTON_WIDTH, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_SECTION_TYPE, DEFAULT_TAGS, DEFAULT_TITLE, DEFAULT_URL } from "@bk2/shared-constants";
import type { 
  AccordionSection, AlbumConfig, AlbumSection, ArticleConfig, ArticleSection, 
  AvatarConfig, ButtonConfig, ButtonSection, ButtonStyle, CalendarSection, 
  ChartSection, ChatConfig, ChatSection, EditorConfig, EventsConfig, EventsSection, GalleryConfig, 
  GallerySection, HeroConfig, HeroSection, IconConfig, IframeConfig, 
  IframeSection, InvitationsConfig, InvitationsSection, MapConfig, MapSection, PeopleConfig, 
  PeopleSection, SliderConfig, SliderSection, TableConfig, TableSection, 
  TrackerConfig, TrackerSection, VideoConfig, VideoSection 
} from "./section.model";
import { AlbumStyle } from './enums/album-style.enum';
import { ButtonAction } from './enums/button-action.enum';
import { ColorIonic } from './enums/color-ionic.enum';
import { GalleryEffect } from './enums/gallery-effect.enum';
import { ViewPosition } from './enums/view-position.enum';
import { NameDisplay } from './enums/name-display.enum';
import { AvatarInfo } from './avatar-info';
import { ImageConfig, Slot } from './image.model';
import { IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE } from "./image.shapes";

const imgixBaseUrl = 'https://bkaiser.imgix.net'; // tbd: temporary solution


// --------------------------------------- PART SHAPES (reused by several sections) ----------------------------------------
export const EDITOR_CONFIG_SHAPE = {
    htmlContent: '<p></p>',
    colSize: 4,
    position: ViewPosition.None
} as EditorConfig;

// --------------------------------------- ABSTRACT BASE SECTION SHAPE ----------------------------------------
export const BASE_SECTION_SHAPE = {
  bkey: DEFAULT_KEY,
  type: DEFAULT_SECTION_TYPE,
  name: DEFAULT_NAME,
  title: DEFAULT_TITLE,
  subTitle: DEFAULT_TITLE,
  index: DEFAULT_INDEX,
  color: ColorIonic.Primary,
  colSize: '12',
  roleNeeded: 'contentAdmin',
  isArchived: false,
  content: {
    htmlContent: '<p></p>',
    colSize: 3,
    position: ViewPosition.Top
  },
  notes: DEFAULT_NOTES,
  tags: DEFAULT_TAGS,
  tenants: []
};

// --------------------------------------- CONCRETE SECTION CONFIG SHAPES ----------------------------------------
// --------------------------------------- ALBUM ----------------------------------------
export const ALBUM_CONFIG_SHAPE = {
    directory: '',
    imageStyle: IMAGE_STYLE_SHAPE,
    albumStyle: AlbumStyle.Grid,
    recursive: false,
    showVideos: false,
    showStreamingVideos: false,
    showDocs: false,
    showPdfs: true,
    effect: GalleryEffect.Slide
} as AlbumConfig;

// --------------------------------------- ARTICLE ----------------------------------------
export const ARTICLE_CONFIG_SHAPE = {
    image: IMAGE_CONFIG_SHAPE,
    imageStyle: IMAGE_STYLE_SHAPE,
} as ArticleConfig;

// --------------------------------------- BUTTON ----------------------------------------
export const ICON_CONFIG_SHAPE = {
    name: 'filetypes:pdf',
    size: 60,
    slot: 'iconOnly' as Slot
} as IconConfig;

export const BUTTON_STYLE_SHAPE = {
  label: DEFAULT_LABEL,
  shape: 'default',
  fill: 'clear',
  width: BUTTON_WIDTH,
  height: BUTTON_HEIGHT,
  color: ColorIonic.Primary
} as ButtonStyle;

export const BUTTON_CONFIG_SHAPE = {
    icon: ICON_CONFIG_SHAPE,
    style: BUTTON_STYLE_SHAPE,
    action: {
      type: ButtonAction.None,
      url: ''
    }
} as ButtonConfig;

// --------------------------------------- CALENDAR ----------------------------------------
export const CALENDAR_OPTIONS_SHAPE = {} as CalendarOptions;    // from FullCalendar

// --------------------------------------- CHART ----------------------------------------
export const ECHARTS_OPTIONS_SHAPE = {} as EChartsOption;

// --------------------------------------- CHAT ----------------------------------------
export const CHAT_CONFIG_SHAPE = {
  id: `chat-${Math.random().toString(36).substring(2)}`,
  name: 'Gruppenchat',
  url: imgixBaseUrl + '/logo/icons/chatbox.svg',
  description: '',
  type: 'messaging',
} as ChatConfig;

// --------------------------------------- EVENTS ----------------------------------------
export const EVENTS_CONFIG_SHAPE = {
  moreUrl: '',
  maxEvents: 5,
  showPastEvents: false,
  showUpcomingEvents: true,
  showEventTime: true,
  showEventLocation: false,
} as EventsConfig;

// --------------------------------------- GALLERY ----------------------------------------
export const GALLERY_CONFIG_SHAPE = {
    images: [] as ImageConfig[],
    imageStyle: IMAGE_STYLE_SHAPE,
} as GalleryConfig;

// --------------------------------------- HERO ----------------------------------------
export const HERO_CONFIG_SHAPE = {
    logo: IMAGE_CONFIG_SHAPE,
    hero: IMAGE_CONFIG_SHAPE,
    imageStyle: IMAGE_STYLE_SHAPE,
} as HeroConfig;

// --------------------------------------- IFRAME ----------------------------------------
export const IFRAME_CONFIG_SHAPE = {
    url: DEFAULT_URL,
    style: 'width: 100%; min-height:400px; border: none;'
} as IframeConfig;

// --------------------------------------- INVITATIONS ----------------------------------------
export const INVITATIONS_CONFIG_SHAPE = {
  moreUrl: '',
  maxItems: 5,
  showPastItems: false,
  showUpcomingItems: true,
} as InvitationsConfig;

// --------------------------------------- MAP ----------------------------------------
export const MAP_CONFIG_SHAPE = {
    centerLatitude: 0,
    centerLongitude: 0,
    zoom: 10,
    useCurrentLocationAsCenter: true
} as MapConfig;

// --------------------------------------- PEOPLE ----------------------------------------
export const AVATAR_CONFIG_SHAPE = {
  cols: 2,
  color: ColorIonic.Light,
  showName: true,
  showLabel: false,
  nameDisplay: NameDisplay.FirstLast,
  altText: 'avatar',
  title: DEFAULT_TITLE,
  linkedSection: DEFAULT_KEY
} as AvatarConfig;

export const PEOPLE_CONFIG_SHAPE = {
  avatar: AVATAR_CONFIG_SHAPE,
  persons: [] as AvatarInfo[]
} as PeopleConfig;

// --------------------------------------- SLIDER ----------------------------------------
export const SLIDER_CONFIG_SHAPE = {
    images: [] as ImageConfig[],
    imageStyle: IMAGE_STYLE_SHAPE,
} as SliderConfig;

// --------------------------------------- TABLE ----------------------------------------
export const TABLE_CONFIG_SHAPE = {
    data: {
        header: [] as string[],
        body: [] as string[]
    },
    grid: {
        template: 'auto auto',
        gap: '1px',
        backgroundColor: 'grey',
        padding: '1px'
    },
    header: {
        backgroundColor: 'lightgrey',
        textAlign: 'center',
        fontSize: '1rem',
        fontWeight: 'bold',
        padding: '5px'
    },
    body: {
        backgroundColor: 'white',
        textAlign: 'left',
        fontSize: '0.8rem',
        fontWeight: 'normal',
        padding: '5px'
    }
} as TableConfig;

// --------------------------------------- TRACKER ----------------------------------------
export const TRACKER_CONFIG_SHAPE = {
    autostart: false,
    intervalInSeconds: 900,
    enableHighAccuracy: true,
    maximumAge: 0,
    exportFormat: 'kmz'
} as TrackerConfig;

// --------------------------------------- VIDEO ----------------------------------------
export const VIDEO_CONFIG_SHAPE = {
    url: DEFAULT_URL,
    width: '100%',
    height: 'auto',
    frameborder: '0px',
    baseUrl: 'https://www.youtube.com/embed/'
} as VideoConfig;

// --------------------------------------- CONCRETE SECTION SHAPES ----------------------------------------

export const ACCORDION_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'accordion',
  properties: {
    value: DEFAULT_LABEL,
    readonly: true,
    multiple: true,
    items: []
  }
} as AccordionSection;

export const ALBUM_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'album',
  properties: ALBUM_CONFIG_SHAPE
} as AlbumSection;

export const ARTICLE_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'article',
  properties: ARTICLE_CONFIG_SHAPE
} as ArticleSection;

export const BUTTON_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'button',
  properties: BUTTON_CONFIG_SHAPE
} as ButtonSection;

export const CAL_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'cal',
  properties: CALENDAR_OPTIONS_SHAPE
} as CalendarSection;

export const CHART_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'chart',
  properties: ECHARTS_OPTIONS_SHAPE
} as ChartSection;

export const CHAT_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'chat',
  properties: CHAT_CONFIG_SHAPE
} as ChatSection;

export const GALLERY_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'gallery',
  properties: GALLERY_CONFIG_SHAPE
} as GallerySection;

export const HERO_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'hero',
  properties: HERO_CONFIG_SHAPE
} as HeroSection;

export const IFRAME_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'iframe',
  properties: IFRAME_CONFIG_SHAPE
} as IframeSection;

export const MAP_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'map',
  properties: MAP_CONFIG_SHAPE
} as MapSection;

export const PEOPLE_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'people',
  properties: PEOPLE_CONFIG_SHAPE
} as PeopleSection;

export const SLIDER_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'slider',
  properties: SLIDER_CONFIG_SHAPE
} as SliderSection;

export const TABLE_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'table',
  properties: TABLE_CONFIG_SHAPE
} as TableSection;

export const TRACKER_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'tracker',
  properties: TRACKER_CONFIG_SHAPE
} as TrackerSection;

export const VIDEO_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'video',
  properties: VIDEO_CONFIG_SHAPE
} as VideoSection;

export const EVENTS_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'events',
  properties: EVENTS_CONFIG_SHAPE
} as EventsSection;

export const INVITATIONS_SECTION_SHAPE = {
  ...BASE_SECTION_SHAPE,
  type: 'invitations',
  properties: INVITATIONS_CONFIG_SHAPE
} as InvitationsSection;