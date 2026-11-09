import { ImageActionType } from "./enums/image-action.enum";
import { ImageType } from "./enums/image-type.enum";


export type Slot = 'start' | 'end' | 'icon-only' | 'none';

/** where an image's caption (Untertitel) is shown: not at all, above/below the image, or laid over its top/middle/bottom */
export type CaptionPosition = 'none' | 'top' | 'bottom' | 'top-overlay' | 'middle-overlay' | 'bottom-overlay';
export const CAPTION_POSITIONS: CaptionPosition[] = ['none', 'top', 'bottom', 'top-overlay', 'middle-overlay', 'bottom-overlay'];

/** the horizontal alignment of an image caption */
export type CaptionAlign = 'left' | 'center' | 'right';
export const CAPTION_ALIGNS: CaptionAlign[] = ['left', 'center', 'right'];

/** the font style of an image caption */
export type CaptionStyle = 'normal' | 'italic' | 'bold' | 'bold-italic';
export const CAPTION_STYLES: CaptionStyle[] = ['normal', 'italic', 'bold', 'bold-italic'];


// the configuration of a single image, identifies a single image or a specific image in an image list
export interface ImageConfig {
  label: string; // a short title to identify the image (this is shown in lists)
  type: ImageType; // the type of the image, default is ImageType.Image
  url: string; // the url of the image, a relative path to the file in Firebase storage; this is used as a basis to construct the imgix url
  actionUrl: string; // optional url used with certain actions (e.g. open link)
  altText: string; // aria text for the image
  overlay: string; // caption (Untertitel) of the image; when set it wins over the auto-composed title/source caption
  documentKey?: string; // FK to the corresponding DocumentModel (every image has a document entry)
  credit?: string; // image attribution / copyright, denormalized from DocumentModel.credit; rendered when ImageStyle.showSource is true
  /** true, solange die Transkodierung eines Videos noch läuft (kein mp4-Rendering).
   *  Das Grid zeigt dann die Wartekachel statt eines Players, der nichts abspielen kann. */
  pending?: boolean;
}


// style configuration for an image; these values are valid for single images as well as image lists (galleries, albums, sliders)
export interface ImageStyle {
    imgIxParams: string; // extra imgix query parameters (e.g. 'sat=-100&blur=20'), appended after the generated ones
    width: string; // css length of the image width, e.g. 100%, 300px, 50vw, auto; default is 100%
    height: string; // css length of the image height, e.g. auto, 300px, 50vh; a plain number counts as px; default is auto
    sizes: string; // the sizes attribute for the img tag, default is '(max-width: 1240px) 50vw, 300px'
    border: string; // css border around the image, e.g. '1px solid' or '2px solid #ccc'; default is '1px solid'
    borderRadius: string; // css corner radius, e.g. '4px'; a plain number counts as px; default is '4px'
    isThumbnail: boolean; // if true, images are displayed as a thumbnail, default: false
    slot: Slot; // default is none
    fill: boolean; // if true (and height is a real size), the image covers a fixed box of that height and is cropped; otherwise the whole image is shown at its own proportions. default is false
    hasPriority: boolean; // if true, the image is loaded first (only for the first, immediately visible image), default is false
    action: ImageActionType; // the action to perform when clicking on the image, default is ImageAction.None
    zoomFactor: number; // the zoom factor when using the zoom action, default is 2
    /** @deprecated no longer read (2026-11-09): the caption follows a fixed rule, see buildImageCaption */
    showTitle?: boolean;
    /** @deprecated no longer read (2026-11-09): the caption follows a fixed rule, see buildImageCaption */
    showSource?: boolean;
    captionPosition?: CaptionPosition; // where the caption is shown, default: 'none'
    captionSize?: string; // css font-size of the caption, default: '0.8rem'
    captionStyle?: CaptionStyle; // font style of the caption, default: 'italic'
    captionAlign?: CaptionAlign; // horizontal alignment of the caption, default: 'left'
}

export interface BackgroundStyle {
  'background-image': string;
  'min-height': string;
  'background-size': 'cover' | 'contain' | 'auto';
  'background-position': string;
  'border'?: string;
  'border-radius'?: string;
}

// get this from imxig with fm=json
export interface ImageMetaData {
  altitude: number; // GPS.Altitude
  latitude: number; // GPS.Latitude
  longitude: number; // GPS.Longitude
  speed: number; // GPS.Speed
  direction: number; // GPS.ImgDirection
  size: number; // ContentLength
  height: number; // PixelHeight
  width: number; // PixelWidth   -> portrait = height > width, landscape = width > height
  cameraMake: string; // TIFF.Make
  cameraModel: string; // TIFF.Model
  software: string; // TIFF.Software
  focalLength: number; // EXIF.FocalLength mm
  focalLengthIn35mmFilm: number; // EXIF.FocalLengthIn35mmFilm 35mm equivalent
  aperture: number; // EXIF.FNumber  f/2.8
  exposureTime: number; // EXIF.ExposureTime
  iso: number; // EXIF.ISOSpeedRatings
  lensModel: string; // EXIF.LensModel
}