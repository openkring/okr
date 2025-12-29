import { CalendarOptions } from '@fullcalendar/core';
import { EChartsOption } from 'echarts';

import { AlbumStyle, ButtonAction, ColorIonic, GalleryEffect, ViewPosition, RoleName, AvatarInfo, NameDisplay, ImageStyle, ImageConfig, Slot } from "@bk2/shared-models";

export const SectionCollection = 'sections';
export const SectionModelName = 'section';

export type SectionType = 
    'album' | 'article' | 'button' | 'cal' | 'chart' | 'chat' | 'emergency' |'gallery' | 'hero' | 'iframe' | 'map' | 'people' | 'slider' | 'table' | 'tracker' | 'video';

// discriminated union of all section models
export type SectionModel =
    AlbumSection | ArticleSection | ButtonSection | CalendarSection | ChartSection | ChatSection |
    GallerySection | HeroSection | IframeSection | MapSection | PeopleSection | SliderSection | 
    TableSection | TrackerSection | VideoSection;

// --------------------------------------- ABSTRACT BASE SECTION MODELS ----------------------------------------
export interface BaseSection {
  bkey: string;
  type: SectionType;
  name: string;
  title: string;
  subTitle: string;
  index: string;
  color: ColorIonic;
  roleNeeded: RoleName;
  isArchived: boolean;
  content: EditorConfig; // content from rich text editor
  properties?: AlbumConfig | ArticleConfig | ButtonConfig | CalendarOptions | EChartsOption | ChatConfig | GalleryConfig | HeroConfig | IframeConfig | MapConfig | PeopleConfig | SliderConfig | TableConfig | TrackerConfig | VideoConfig;
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
// album
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

// article
export interface ArticleSection extends BaseSection {
  type: 'article';
  properties: ArticleConfig;
}

export interface ArticleConfig {
    image: ImageConfig;
    imageStyle: ImageStyle;
}

// button
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
    size: 'small' | 'default' | 'large'; // default is 'default'
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

// calendar
export interface CalendarSection extends BaseSection {
  type: 'cal';
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

// chart
export interface ChartSection extends BaseSection {
  type: 'chart';
  properties: EChartsOption;
}

/*
see: https://echarts.apache.org/en/option.html#title
*/

// chat
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

// gallery
export interface GallerySection extends BaseSection {
  type: 'gallery';
  properties: GalleryConfig;
}

export interface GalleryConfig {
  images: ImageConfig[]; // list of images to be shown in the gallery
  imageStyle: ImageStyle;
}

// hero
export interface HeroSection extends BaseSection {
  type: 'hero';
  properties: HeroConfig;
}

export interface HeroConfig {
  logo: ImageConfig; // the logo image
  hero: ImageConfig; // the hero background image
  imageStyle: ImageStyle;
}

// iframe
export interface IframeSection extends BaseSection {
  type: 'iframe';
  properties: IframeConfig;
}

export interface IframeConfig {
  style: string; // css style for the iframe, default is 'width: 100%; min-height:400px; border: none;'
  url: string; // the url of the iframe
}

// map
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

// people
export interface PeopleSection extends BaseSection {
  type: 'people';
  properties: PeopleConfig;
}

export interface PeopleConfig {
  avatar: AvatarConfig;
  persons: AvatarInfo[]; // list of persons to be shown
}

export interface AvatarConfig {
  cols: number; // number of columns, 0 - 4, default is 2
  color: ColorIonic; // color of the avatar, default is ColorIonic.Light
  showName: boolean; // if true, the name is displayed, default is true
  showLabel: boolean; // if true, the label is displayed, default is true
  nameDisplay: NameDisplay; // NameDisplay enum, default is FirstLast
  altText: string; // alt text for the image, default is 'avatar'
  title: string;
  linkedSection: string; // this section content will be shown in a modal when the title is clicked
}

// slider
export interface SliderSection extends BaseSection {
  type: 'slider';
  properties: SliderConfig;
}

export interface SliderConfig {
  images: ImageConfig[]; // list of images to be shown in the gallery
  imageStyle: ImageStyle;
}

// table
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
}

export interface TableStyle {
  backgroundColor: string;
  textAlign: string;
  fontSize: string;
  fontWeight: string;
  padding: string;
}

// tracker
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

// video
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



