/* eslint-disable @typescript-eslint/no-explicit-any */
import { AvatarInfo } from './avatar-info';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AlbumStyle } from './enums/album-style.enum';
import { ButtonAction } from './enums/button-action.enum';
import { ColorIonic } from './enums/color-ionic.enum';
import { GalleryEffect } from './enums/gallery-effect.enum';
import { HorizontalPosition } from './enums/horizontal-position.enum';
import { ImageAction } from './enums/image-action.enum';
import { ImageType } from './enums/image-type.enum';
import { SectionType } from './enums/section-type.enum';
import { ViewPosition } from './enums/view-position.enum';

export type Slot = 'start' | 'end' | 'icon-only' | 'none';

export interface AccordionSection {
  key?: string;
  label?: string;
  value?: string;
}

export interface Accordion {
  sections?: AccordionSection[]; // a description of all sections that are contained within the accordion
  value?: string; // the selected accordion values
  multiple?: boolean; // if true, multiple sections can be opened at the same time, default is false
  readonly?: boolean; // if true, the accordion is readonly, default is false
}

export interface AlbumConfig {
  directory?: string; // the directory in Firebase storage (relative path)
  albumStyle?: AlbumStyle; // the style of the album (grid, list, slider), default is AlbumStyle.Grid
  defaultImageConfig?: DefaultImageConfig; // the configuration of the images
  recursive?: boolean; // if true, the album is shown recursively (several directories deep), default is false
  showVideos?: boolean; // if true, videos are shown, default is false
  showStreamingVideos?: boolean; // if true, streaming videos are shown, default is true
  showDocs?: boolean; // if true, documents are shown, default is false
  showPdfs?: boolean; // if true, pdfs are shown, default is true
  galleryEffect?: GalleryEffect; // the effect used in the gallery, default is GalleryEffect.Slide
}

export interface ChatConfig {
  channelId?: string; // the id of the chat channel, default is 'chat'
  channelName?: string; // the name of the chat channel, default is 'Chat'
  channelImageUrl?: string; // the image of the chat channel, default is ''
  channelDescription?: string; // the description of the chat channel, default is ''
  channelType?: string; // the type of the chat channel, default is 'messaging'
}

// the configuration of an avatar
export interface Avatar {
  cols?: number; // number of columns, 0 - 4, default is 2
  showName?: boolean; // if true, the name is displayed, default is true
  showLabel?: boolean; // if true, the label is displayed, default is true
  nameDisplay?: number; // NameDisplay enum, default is FirstLast
  altText?: string; // alt text for the image, default is 'avatar'
  title?: string;
  linkedSection?: string; // this section content will be shown in a modal when the title is clicked
}

// the configuration of a button
export interface Button {
  label?: string; // the label on the button
  shape?: string; // 'round' or 'default' (= undefined)
  fill?: string; // 'clear', 'outline', 'solid'
  width?: string; // should be bigger than the iconSize, default is same value for width and height (cicle button)
  height?: string;
  color?: number; // ColorIonic, default is ColorIonic.Primary
  buttonAction?: ButtonAction; // ButtonAction: default is 'none'
  url?: string; // the url to navigate to
  position?: HorizontalPosition; // HorizontalPosition, default is 'left'
  htmlContent?: string; // html content from editor, default is <p></p>
}

export interface ContentConfig {
  htmlContent?: string; // html content from editor   , default is <p></p>
  colSize?: number; // md-size of the first col, 1-6, default is 4
  position?: ViewPosition; // ViewPosition, default is ViewPosition.None
}

// default configuration valid for all images in a image list
export interface DefaultImageConfig {
  imgIxParams?: string;
  width?: number;
  height?: number;
  sizes?: string;
  borderRadius?: number;
  imageAction?: number; // ImageAction
  zoomFactor?: number;
  isThumbnail?: boolean;
  slot?: Slot;
}

// the configuration of an icon
export interface Icon {
  name?: string; // either ion-icon name (e.g. download, contains -) or FileTypeIcon (e.g. pdf) that resolves into assets/filetypes/file-pdf-light.svg
  size?: string;
  slot?: Slot; // default is 'start'
}

export interface Iframe {
  style?: string; // css style for the iframe, default is 'width: 100%; min-height:400px; border: none;'
  url?: string; // the url of the iframe
}

// the configuration of a single image
export interface Image {
  // identifies a single image or a specific image in an image list
  imageLabel?: string; // a short title to identify the image (this is shown in lists)
  imageType?: number; // ImageType: the type of the image, default is ImageType.Image
  url?: string; // the url of the image, a relative path to the file in Firebase storage; this is used as a basis to construct the imgix url
  actionUrl?: string; // the url used with the action
  altText?: string; // aria text for the image,
  imageOverlay?: string; // used for text overlays on the imgix image
  fill?: boolean; // if true, the image fills the whole container, default is true
  hasPriority?: boolean; // if true, the image is loaded first, default is true
  imgIxParams?: string;
  width?: number; // the width of the image in pixels, default is 160
  height?: number; // the height of the image in pixels, default is 90
  sizes?: string; // the sizes attribute for the img tag, default is '(max-width: 1240px) 50vw, 300px'
  borderRadius?: number;
  imageAction?: number; // ImageAction: defines the action to start when clicking on an image, default is ImageAction.None
  zoomFactor?: number; // default: 2
  isThumbnail?: boolean; // if true, images are displayed as a thumbnail, default: false
  slot?: Slot; // default is none
}

// get this from imxig with fm=json
export interface ImageMetaData {
  altitude?: number; // GPS.Altitude
  latitude?: number; // GPS.Latitude
  longitude?: number; // GPS.Longitude
  speed?: number; // GPS.Speed
  direction?: number; // GPS.ImgDirection
  size?: number; // ContentLength
  height?: number; // PixelHeight
  width?: number; // PixelWidth   -> portrait = height > width, landscape = width > height
  cameraMake?: string; // TIFF.Make
  cameraModel?: string; // TIFF.Model
  software?: string; // TIFF.Software
  focalLength?: number; // EXIF.FocalLength mm
  focalLengthIn35mmFilm?: number; // EXIF.FocalLengthIn35mmFilm 35mm equivalent
  aperture?: number; // EXIF.FNumber  f/2.8
  exposureTime?: number; // EXIF.ExposureTime
  iso?: number; // EXIF.ISOSpeedRatings
  lensModel?: string; // EXIF.LensModel
}

export interface MapInfo {
  centerLatitude?: string;
  centerLongitude?: string;
  zoom?: string;
  useCurrentLocationAsCenter?: boolean;
}

// the configuration of any BOM
export interface ModelInfo {
  bkey?: string;
  modelType?: number; // ModelType
  visibleAttributes?: string[];
}

export interface TableConfig {
  gridTemplate?: string;
  gridGap?: string;
  gridBackgroundColor?: string;
  gridPadding?: string;
  headerBackgroundColor?: string;
  headerTextAlign?: string;
  headerFontSize?: string;
  headerFontWeight?: string;
  headerPadding?: string;
  cellBackgroundColor?: string;
  cellTextAlign?: string;
  cellFontSize?: string;
  cellFontWeight?: string;
  cellPadding?: string;
}

// GuiColumn is header: string, field: string
export interface Table {
  config?: TableConfig;
  title?: string;
  subTitle?: string;
  description?: string;
  header?: string[]; // column headers: strings or html, the length determines the number of columns
  data?: string[]; // the content of the fields, from top left to bottom right (row by row)
}

export interface TrackerConfig {
  autostart?: boolean; // if true, the tracker starts automatically, default is false
  intervalInSeconds?: number; // the interval in seconds for the tracker, default is 900 (15 min)
  enableHighAccuracy?: boolean; // high accuracy (such as GPS, if available), default is true
  maximumAge?: number; // the maximum wait time in milliseconds of a possible cached position that is acceptable to return, default is 0
  exportFormat?: 'kmz' | 'json' | 'csv'; // the format for exporting the data, default is 'kmz'
}

export interface VideoConfig {
  url?: string; // the url of the video
  width?: number; // the width of the video, default is 100%
  height?: number; // the height of the video, default is auto
  frameborder?: boolean; // default 0
  baseUrl?: boolean; // default is https://www.youtube.com/embed/
}

export interface SectionProperties {
  accordion?: Accordion;
  album?: AlbumConfig;
  chat?: ChatConfig;
  calendarOptions?: any; // CalendarOptions, but we don't want to have this dependency here
  content?: ContentConfig; // used for Article, Button, PeopleList (using editor)
  avatar?: Avatar;
  button?: Button;
  defaultImageConfig?: DefaultImageConfig; // configures the layout and style of the images
  echarts?: any; // EChartsCoreOption, but we don't want to have this dependency here
  icon?: Icon;
  iframe?: Iframe;
  image?: Image; // single image, e.g. Hero
  imageList?: Image[]; // list of images, e.g. Album, Slider, Gallery
  logo?: Image; // logo image
  map?: MapInfo;
  modelInfo?: ModelInfo;
  persons?: AvatarInfo[];
  table?: Table;
  trackerConfig?: TrackerConfig;
  video?: VideoConfig;
}

export class SectionModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public name = ''; // a meaningful name of the section
  public index = '';
  public tags = '';
  public description = ''; // a detailed description of the section
  public roleNeeded = 'privileged'; // RoleName
  public color: ColorIonic | undefined = undefined;
  public title: string | undefined = undefined;
  public subTitle: string | undefined = undefined;
  public type = SectionType.Article;
  public properties: SectionProperties = {};

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const SectionCollection = 'sections3';

// -----------------------------------------------------

export function newImage(title = '', url = '', actionUrl = '', altText = '', defaultImageConfig = newDefaultImageConfig()): Image {
  return {
    imageLabel: title,
    imageType: ImageType.Image,
    url: url,
    actionUrl: actionUrl,
    altText: altText,
    imageOverlay: '',
    fill: true,
    hasPriority: false,
    imgIxParams: defaultImageConfig.imgIxParams,
    width: defaultImageConfig.width,
    height: defaultImageConfig.height,
    sizes: defaultImageConfig.sizes,
    borderRadius: defaultImageConfig.borderRadius,
    imageAction: defaultImageConfig.imageAction,
    zoomFactor: defaultImageConfig.zoomFactor,
    isThumbnail: defaultImageConfig.isThumbnail,
    slot: defaultImageConfig.slot,
  };
}

export function newDefaultImageConfig(): DefaultImageConfig {
  return {
    imgIxParams: '',
    width: 160,
    height: 90,
    sizes: '(max-width: 786px) 50vw, 100vw',
    borderRadius: 4,
    imageAction: ImageAction.None,
    zoomFactor: 2,
    isThumbnail: false,
    slot: 'none',
  };
}

export function newButton(width = '60px', height = '60px'): Button {
  return {
    label: '',
    shape: 'round',
    fill: 'clear',
    width: width,
    height: height,
    color: ColorIonic.Primary,
    buttonAction: ButtonAction.None,
  };
}

export function newIcon(): Icon {
  return {
    name: 'pdf',
    size: '40px',
    slot: 'start',
  };
}
