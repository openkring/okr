import { ImageActionType } from "./enums/image-action.enum";
import { ImageType } from "./enums/image-type.enum";


export type Slot = 'start' | 'end' | 'icon-only' | 'none';


// the configuration of a single image, identifies a single image or a specific image in an image list
export interface ImageConfig {
  label: string; // a short title to identify the image (this is shown in lists)
  type: ImageType; // the type of the image, default is ImageType.Image
  url: string; // the url of the image, a relative path to the file in Firebase storage; this is used as a basis to construct the imgix url
  actionUrl: string; // optional url used with certain actions (e.g. open link)
  altText: string; // aria text for the image
  overlay: string; // used for text overlays on the imgix image
}


// style configuration for an image; these values are valid for single images as well as image lists (galleries, albums, sliders)
export interface ImageStyle {
    imgIxParams: string;
    width: string; // the width of the image in pixels, default is 160, could be auto, 100% etc.
    height: string; // the height of the image in pixels, default is 90, could be auto, 100% etc. 
    sizes: string; // the sizes attribute for the img tag, default is '(max-width: 1240px) 50vw, 300px'
    border: string; // the border around the image, default is '1px'
    borderRadius: string;
    isThumbnail: boolean; // if true, images are displayed as a thumbnail, default: false
    slot: Slot; // default is none
    fill: boolean; // if true, the image fills the whole container, default is true
    hasPriority: boolean; // if true, the image is loaded first, default is true
    action: ImageActionType; // the action to perform when clicking on the image, default is ImageAction.None
    zoomFactor: number; // the zoom factor when using the zoom action, default is 2
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