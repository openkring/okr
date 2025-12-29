import { HttpClient } from "@angular/common/http";
import { FirebaseStorage, listAll, ref, StorageReference } from "firebase/storage";
import { firstValueFrom } from "rxjs";

import { AlbumConfig, BackgroundStyle, ImageActionType, ImageConfig, ImageMetaData, ImageStyle, ImageType } from "@bk2/shared-models";
import { debugData, die, getImageType, getImgixJsonUrl, getSizedImgixParamsByExtension } from "@bk2/shared-util-core";
import { DEFAULT_ALBUM_HEIGHT, DEFAULT_ALBUM_WIDTH, DEFAULT_BORDER, DEFAULT_BORDER_RADIUS, DEFAULT_SIZES, THUMBNAIL_SIZE } from "@bk2/shared-constants";


export async function listAllFilesFromDirectory(
  storage: FirebaseStorage,
  config: AlbumConfig,
  imgixBaseUrl: string,
  directory: string): Promise<ImageConfig[]> {
  const images: ImageConfig[] = [];
  try {
    const listRef = ref(storage, directory);

    // listAll returns prefixes (= subdirectories) and items (= files)
    const result = await listAll(listRef);

    // list all subdirectories in the directory
    result.prefixes.forEach((_dir) => {
      images.push(getImage(imgixBaseUrl, directory, _dir, ImageType.Dir));
    });

    // list all files in the directory
    result.items.forEach((_file) => {
      const imageType = getImageType(_file.name);
      switch (imageType) {
        case ImageType.Image:
          images.push(getImage(imgixBaseUrl, directory, _file, imageType));
          break;
        case ImageType.Video:
          if (config.showVideos) {
            images.push(getImage(imgixBaseUrl, directory, _file, imageType));
          }
          break;
        case ImageType.StreamingVideo:
          if (config.showStreamingVideos) {
            images.push(getImage(imgixBaseUrl, directory, _file, imageType));
          }
          break;
        case ImageType.Pdf:
          if (config.showPdfs) {
            images.push(getImage(imgixBaseUrl, directory, _file, imageType));
          }
          break;
        case ImageType.Doc:
          if (config.showDocs) {
            images.push(getImage(imgixBaseUrl, directory, _file, imageType));
          }
          break;
        case ImageType.Audio:
        default:
          break;
      }
    });
  }
  catch (ex) {
    console.error('AlbumlistAllFilesFromCurrentDirectory -> error: ', ex);
  }
  return images;
}

/**
 * Return a thumbnail representation of the file given based on its mime type.
 * image:  thumbnail image
 * video:  move icon to download the video
 * streaming video: ix-player (bk-video)
 * other:  file icon to download the file
 * @param ref 
 * @param url 
 * @param actionUrl 
 * @returns 
 */
export function getImage(imgixBaseUrl: string, directory: string, ref: StorageReference, imageType: ImageType): ImageConfig {
  const label = (imageType === ImageType.Dir) ? ref.name + ' directory' : ref.name;
  return {
    label: ref.name,
    type: imageType,
    url: getUrl(imgixBaseUrl, directory, imageType, ref.name),
    actionUrl: getActionUrl(imgixBaseUrl, directory, imageType, ref.name),
    altText: label,
    overlay: 'label'
  };
}

export function getImageStyle(imageType: ImageType): ImageStyle {
  return {
    imgIxParams: '',
    width: (imageType === ImageType.Image) ? DEFAULT_ALBUM_WIDTH + '' : THUMBNAIL_SIZE + '',
    height: (imageType === ImageType.Image) ? DEFAULT_ALBUM_HEIGHT + '' : THUMBNAIL_SIZE + '',
    sizes: DEFAULT_SIZES,
    border: DEFAULT_BORDER,
    borderRadius: DEFAULT_BORDER_RADIUS,
    isThumbnail: false,
    slot: 'icon-only',
    fill: imageType === ImageType.Image,
    hasPriority: false,
    action: getActionFromImageType(imageType),
    zoomFactor: 2
  };
}

export function getUrl(imgixBaseUrl: string, directory: string, imageType: ImageType, fileName: string): string {
  switch (imageType) {
    case ImageType.Image: return `${directory}/${fileName}`;
    case ImageType.Video: return 'logo/filetypes/video.svg';
    case ImageType.StreamingVideo: return `${imgixBaseUrl}/${directory}/${fileName}`;
    case ImageType.Audio: return 'logo/filetypes/audio.svg';
    case ImageType.Pdf: return `${directory}/${fileName}`;
    case ImageType.Doc: return 'logo/filetypes/doc.svg';
    case ImageType.Dir: return 'logo/filetypes/folder.svg';
    default: return 'logo/filetypes/file.svg';
  }
}

export function getActionUrl(imgixBaseUrl: string, directory: string, imageType: ImageType, fileName: string): string {
  const downloadUrl = `${imgixBaseUrl}/${directory}/${fileName}`;
  switch (imageType) {
    case ImageType.Video:
    case ImageType.Audio:
    case ImageType.Doc:
    case ImageType.Pdf: return downloadUrl;
    case ImageType.Dir: return `${directory}/${fileName}`;
    default: return '';
  }
}

export function getActionFromImageType(imageType: ImageType): ImageActionType {
  switch (imageType) {
    case ImageType.Image: return ImageActionType.OpenSlider;
    case ImageType.Pdf:
    case ImageType.Audio:
    case ImageType.Doc:
    case ImageType.Video: return ImageActionType.Download;
    case ImageType.Dir: return ImageActionType.OpenDirectory;
    default: return ImageActionType.None;
  }
}

// plus: ImageAction.type -> ImageAction.Download 
export function convertThumbnailToFullImage(imageStyle: ImageStyle, width: number, height: number): ImageStyle {
  const image = structuredClone(imageStyle);
  image.isThumbnail = false;
  image.fill = true;
  image.width = width + '';
  image.height = height + '';
  return image;
}

export function getBackgroundStyle(imgixBaseUrl: string, imageStyle: ImageStyle, url: string): BackgroundStyle {
  if (!imageStyle.width || !imageStyle.height) die('album.util.getBackgroundStyle: image width and height must be set');
  const params = getSizedImgixParamsByExtension(url, imageStyle.width, imageStyle.height);
  const fullUrl = `${imgixBaseUrl}/${url}?${params}`;
  return {
    'background-image': `url(${fullUrl})`,
    'min-height': '200px',
    'background-size': 'cover',
    'background-position': 'center',
    'border': '1px'
  };
}

interface ImageMetaDataResponse {
  GPS?: { Altitude?: number; Latitude?: number; Longitude?: number; Speed?: number; ImgDirection?: number; };
  'Content-Length'?: number;
  PixelHeight?: number;
  PixelWidth?: number;
  TIFF?: { Make?: string; Model?: string; Software?: string; };
  Exif?: { FocalLength?: number; FocalLengthIn35mmFilm?: number; FNumber?: number; ExposureTime?: number; ISOSpeedRatings?: number; LensModel?: string; };
}

export async function getImageMetaData(httpClient: HttpClient, imgixBaseUrl: string, image?: ImageConfig): Promise<ImageMetaData | undefined> {
  if (!image) die('album.util.getMetaData -> image is mandatory')
  if (!image.url) die('album.util.getMetaData -> image url is not set');
  const url = getImgixJsonUrl(image.url, imgixBaseUrl);
  const data = await firstValueFrom(httpClient.get<ImageMetaDataResponse>(url));
  debugData('album.util.getMetaData -> data: ', data);
  const metaData: ImageMetaData = {
    altitude: data.GPS?.Altitude ?? 0,
    latitude: data.GPS?.Latitude ?? 0,
    longitude: data.GPS?.Longitude ?? 0,
    speed: data.GPS?.Speed ?? 0,
    direction: data.GPS?.ImgDirection ?? 0,
    size: data['Content-Length'] ?? 0,
    height: data.PixelHeight ?? 0,
    width: data.PixelWidth ?? 0,
    cameraMake: data.TIFF?.Make ?? '',
    cameraModel: data.TIFF?.Model ?? '',
    software: data.TIFF?.Software ?? '',
    focalLength: data.Exif?.FocalLength ?? 0,
    focalLengthIn35mmFilm: data.Exif?.FocalLengthIn35mmFilm ?? 0,
    aperture: data.Exif?.FNumber ?? 0,
    exposureTime: data.Exif?.ExposureTime ?? 0,
    iso: data.Exif?.ISOSpeedRatings ?? 0,
    lensModel: data.Exif?.LensModel ?? ''
  };
  debugData('album.util.getMetaData -> metaData: ', metaData);
  return metaData;
}