import { CalendarOptions } from '@fullcalendar/core';
import { EChartsOption } from 'echarts';

import { AlbumStyle } from './enums/album-style.enum';
import { ButtonAction } from './enums/button-action.enum';
import { ColorIonic } from './enums/color-ionic.enum';
import { GalleryEffect } from './enums/gallery-effect.enum';
import { ViewPosition } from './enums/view-position.enum';
import { NameDisplay } from './enums/name-display.enum';
import { RoleName } from './menu-item.model';
import { AvatarInfo } from './avatar-info';
import { ImageStyle, ImageConfig, Slot } from './image.model';

export const SectionCollection = 'sections';
export const SectionModelName = 'section';

export type SectionType = 
    'album' | 'article' | 'button' | 'cal' | 'chart' | 'chat' | 'emergency' |'gallery' | 'hero' | 'iframe' | 'map' | 
    'people' | 'slider' | 'table' | 'tracker' | 'video' | 'accordion' | 'events' | 'invitations';

// discriminated union of all section models
export type SectionModel =
    AlbumSection | ArticleSection | ButtonSection | CalendarSection | ChartSection | ChatSection |
    GallerySection | HeroSection | IframeSection | MapSection | PeopleSection | SliderSection | 
    TableSection | TrackerSection | VideoSection | AccordionSection | EventsSection | InvitationsSection;

// --------------------------------------- ABSTRACT BASE SECTION MODELS ----------------------------------------
export interface BaseSection {
  bkey: string;
  type: SectionType;
  name: string;
  title: string;
  subTitle: string;
  index: string;
  color: ColorIonic;
  colSize: string; // col size(s) of the section card itself, e.g. '12' or '12,6,4' (default, md, lg)
  roleNeeded: RoleName;
  isArchived: boolean;
  content: EditorConfig; // content from rich text editor
  properties?: AccordionConfig | AlbumConfig | ArticleConfig | ButtonConfig | CalendarOptions | EChartsOption | ChatConfig | GalleryConfig | HeroConfig | 
  IframeConfig | MapConfig | PeopleConfig | SliderConfig | TableConfig | TrackerConfig | VideoConfig | EventsConfig | InvitationsConfig;
  notes: string;
  tags: string;
  tenants: string[]; // list of tenant ids
}

export interface EditorConfig {
  htmlContent: string; // html content from editor, default is <p></p>
  colSize: number; // md-size of the first col, 1-6, default is 4
  position: ViewPosition; // ViewPosition, default is ViewPosition.None
}

// --------------------------------------- CONCRETE SECTION MODELS ----------------------------------------
// --------------------------------------- ACCORDION ----------------------------------------
export interface AccordionSection extends BaseSection {
  type: 'accordion';
  properties: AccordionConfig;
}

export interface AccordionConfig {
  multiple: boolean;
  readonly: boolean;
  value: string;
  items: AccordionItem[];
}

export interface AccordionItem {
  key: string;
  label: string;
  value: string;        // used for accordion state (which item is open)
  sectionId?: string;   // reference to section to render in accordion content
}

// --------------------------------------- ALBUM ----------------------------------------
export interface AlbumSection extends BaseSection {
  type: 'album';
  properties: AlbumConfig;
}

export interface AlbumConfig {
  directory: string;
  imageStyle: ImageStyle;
  albumStyle: AlbumStyle;
  recursive: boolean;
  showVideos: boolean;
  showStreamingVideos: boolean;
  showDocs: boolean;
  showPdfs: boolean;
  effect: GalleryEffect;
}

// --------------------------------------- ARTICLE ----------------------------------------
export interface ArticleSection extends BaseSection {
  type: 'article';
  properties: ArticleConfig;
}

export interface ArticleConfig {
    image: ImageConfig;
    imageStyle: ImageStyle;
}

// --------------------------------------- BUTTON ----------------------------------------
export interface ButtonSection extends BaseSection {
  type: 'button';
  properties: ButtonConfig;
}

export interface ButtonConfig {
  icon: IconConfig;
  style: ButtonStyle;
  action: ButtonActionConfig;
  imageStyle: ImageStyle;
}

export interface IconConfig {
    name: string; // either ion-icon name (e.g. download, contains -) or FileTypeIcon (e.g. pdf) that resolves into assets/filetypes/file-pdf-light.svg
    size: number; // size in px, default is 60, if size is not given, it is set to 60% of the button size (min(width, height))
    slot: Slot; // default is 'start'
}

export interface ButtonStyle {
    label: string; // the label on the button
    shape: 'round' | 'default';
    fill: 'clear' | 'outline' | 'solid';
    width: string; // should be bigger than the iconSize, default is same value for width and height (cicle button)
    height: string;
    color: ColorIonic; // default is ColorIonic.Primary
}

export interface ButtonActionConfig {
  type: ButtonAction; // default is 'none'
  url: string; // the url to navigate to
  altText: string; // alt text for the button, default is the label
}

// --------------------------------------- CALENDAR ----------------------------------------
export interface CalendarSection extends BaseSection {
  type: 'cal';
  // title is from BaseSection
  // name is from BaseSection:  calendar name to show (all, my, explicit)
  properties: CalendarOptions;   // from FullCalendar
}

/*
{
  "calendarOptions": {
    "editable": true,
    "headerToolbar": {
      "center": "title",
      "left": "prev,next,today",
      "right": "dayGridMonth,timeGridWeek,timeGridDay"
    },
    "initialView": "timeGridWeek",
    "locale": "deLocal",
    "slotMaxTime": "22:00:00",
    "slotMinTime": "05:00:00",
    "weekNumbers": true
  }
}
  see:  https://fullcalendar.io/docs#toc
*/

// --------------------------------------- CHART ----------------------------------------
export interface ChartSection extends BaseSection {
  type: 'chart';
  properties: EChartsOption;
}

/*
see: https://echarts.apache.org/en/option.html#title
*/

// --------------------------------------- CHAT ----------------------------------------
export interface ChatSection extends BaseSection {
  type: 'chat';
  properties: ChatConfig;
}

export interface ChatConfig {
  id: string; // the id of the chat channel, default is 'chat'
  name: string; // the name of the chat channel, default is 'Chat'
  url: string; // the image of the chat channel, default is ''
  description: string; // the description of the chat channel, default is ''
  type: string; // the type of the chat channel, default is 'messaging'
  showChannelList: boolean; // if true, the channel list is shown, default is true
}

// --------------------------------------- EVENTS ----------------------------------------
export interface EventsSection extends BaseSection {
  type: 'events';
  properties: EventsConfig;
}

export interface EventsConfig {
  // the list of calendars is typically resolved by the caller based on the currentUser
  // calendarName: string; // calendar name to show: all, my or an explicit calendar name; its name from BaseSection
  // title is from BaseSection
  moreUrl: string; // url to navigate to when 'more' button is clicked
  // later: showPager: boolean; // if true, show pager to navigate between months/weeks/days
  // later: pageSize: number; // number of events per page
  maxEvents: number; // maximum number of events to show
  showPastEvents: boolean; // if true, show past events
  showUpcomingEvents: boolean; // if true, show upcoming events
  showEventTime: boolean; // if true, show event time
  showEventLocation: boolean; // if true, show event location
}

// --------------------------------------- GALLERY ----------------------------------------
export interface GallerySection extends BaseSection {
  type: 'gallery';
  properties: GalleryConfig;
}

export interface GalleryConfig {
  images: ImageConfig[]; // list of images to be shown in the gallery
  imageStyle: ImageStyle;
}

// --------------------------------------- HERO ----------------------------------------
export interface HeroSection extends BaseSection {
  type: 'hero';
  properties: HeroConfig;
}

export interface HeroConfig {
  logo: ImageConfig; // the logo image
  hero: ImageConfig; // the hero background image
  imageStyle: ImageStyle;
}

// --------------------------------------- IFRAME ----------------------------------------
export interface IframeSection extends BaseSection {
  type: 'iframe';
  properties: IframeConfig;
}

export interface IframeConfig {
  style: string; // css style for the iframe, default is 'width: 100%; min-height:400px; border: none;'
  url: string; // the url of the iframe
}

// --------------------------------------- INVITATIONS ----------------------------------------
export interface InvitationsSection extends BaseSection {
  type: 'invitations';
  properties: InvitationsConfig;
}

export interface InvitationsConfig {
  // the list of invitations is typically resolved by the caller based on the currentUser
  // scope: string; // determines the invitations to show: all, my or an explicit calevent key; stored as the name from BaseSection
  // title is from BaseSection
  moreUrl: string; // url to navigate to when 'more' button is clicked
  // later: showPager: boolean; // if true, show pager to navigate between months/weeks/days
  // later: pageSize: number; // number of events per page
  maxItems: number; // maximum number of invitations to show
  showPastItems: boolean; // if true, show past events
  showUpcomingItems: boolean; // if true, show upcoming events
}

// --------------------------------------- MAP ----------------------------------------
export interface MapSection extends BaseSection {
  type: 'map';
    properties: MapConfig;
}

export interface MapConfig {
  centerLatitude: number;
  centerLongitude: number;
  zoom: number;
  useCurrentLocationAsCenter: boolean;
}

// --------------------------------------- PEOPLE ----------------------------------------
export interface PeopleSection extends BaseSection {
  type: 'people';
  properties: PeopleConfig;
}

export interface PeopleConfig {
  avatar: AvatarConfig;
  persons: AvatarInfo[]; // list of persons to be shown
}

export interface AvatarConfig {
  altText: string; // alt text for the image, default is 'avatar'
  color: ColorIonic; // background color of the avatar, default is ColorIonic.Light
  linkedSection: string; // this section content will be shown in a modal when the title is clicked
  nameDisplay: NameDisplay; // NameDisplay enum, default is FirstLast
  showLabel: boolean; // if true, the label of the avatar is displayed as () after the name, default is true
  showName: boolean; // if true, the name of the avatar is displayed, default is true
  title: string; // to add a short text besides the avatar (e.g. Finanzen:   Bruno Kaiser (bkaiser))
}

// --------------------------------------- SLIDER ----------------------------------------
export interface SliderSection extends BaseSection {
  type: 'slider';
  properties: SliderConfig;
}

export interface SliderConfig {
  images: ImageConfig[]; // list of images to be shown in the gallery
  imageStyle: ImageStyle;
}

// --------------------------------------- TABLE ----------------------------------------
export interface TableSection extends BaseSection {
  type: 'table';
  properties: TableConfig;
}

export interface TableConfig {
  data: {
    header: string[]; // column headers: strings or html, the length determines the number of columns
    body: string[]; // the content of the fields, from top left to bottom right (row by row)
  },
  grid: TableGrid;
  header: TableStyle;
  body: TableStyle;
}

export interface TableGrid {
    template: string; 
    gap: string;
    backgroundColor: string;
    padding: string;
    showTitleAs: 'title' | 'legend' | 'header' | 'none';
}

export interface TableStyle {
  backgroundColor: string;
  textAlign: string;
  fontSize: string;
  fontWeight: string;
  padding: string;
  textColor: string;
  border: string;
}

// --------------------------------------- TRACKER ----------------------------------------
export interface TrackerSection extends BaseSection {
  type: 'tracker';
  properties: TrackerConfig;
}

export interface TrackerConfig {
  autostart: boolean; // if true, the tracker starts automatically, default is false
  intervalInSeconds: number; // the interval in seconds for the tracker, default is 900 (15 min)
  enableHighAccuracy: boolean; // high accuracy (such as GPS, if available), default is true
  maximumAge: number; // the maximum wait time in milliseconds of a possible cached position that is acceptable to return, default is 0
  exportFormat: 'kmz' | 'json' | 'csv'; // the format for exporting the data, default is 'kmz'
}

// --------------------------------------- VIDEO ----------------------------------------
export interface VideoSection extends BaseSection {
  type: 'video';
  properties: VideoConfig;
}

export interface VideoConfig {
  url: string; // the url of the video
  width: string; // the width of the video, default is 100%
  height: string; // the height of the video, default is auto
  frameborder: string; // default 0
  baseUrl: string; // default is https://www.youtube.com/embed/
}



