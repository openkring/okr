import { DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_URL } from "@bk2/shared-constants";

import { ImageActionType } from "./enums/image-action.enum";
import { BackgroundStyle, ImageConfig, ImageMetaData, ImageStyle, Slot } from "./image.model";
import { ImageType } from "./enums/image-type.enum";

export const IMAGE_CONFIG_SHAPE = {
    label: DEFAULT_LABEL,
    type: ImageType.Image,
    url: DEFAULT_URL,
    actionUrl: DEFAULT_URL,
    altText: '',
    overlay: ''
} as ImageConfig;

export const IMAGE_STYLE_SHAPE = {
    imgIxParams: '',
    width: '160',
    height: '90',
    sizes: '(max-width: 1240px) 50vw, 300px',
    border: '1px',
    borderRadius: '4',
    isThumbnail: false,
    slot: 'none' as Slot,
    fill: true,
    hasPriority: true,
    action: ImageActionType.None,
    zoomFactor: 2,
} as ImageStyle;

export const BACKGROUND_STYLE_SHAPE = {
    'background-image': '',
    'min-height': '200px',
    'background-size': 'cover',
    'background-position': 'center',
    'border': '1px',
    'border-radius': '4px'
} as BackgroundStyle;

export const IMAGE_METADATA_SHAPE = {
    altitude: 0,
    latitude: 0,
    longitude: 0,
    speed: 0,
    direction: 0,
    size: 0,
    height: 0,
    width: 0,
    cameraMake: DEFAULT_NAME,
    cameraModel: DEFAULT_NAME,
    software: '',
    focalLength: 0,
    focalLengthIn35mmFilm: 0,
    aperture: 0,
    exposureTime: 0,
    iso: 0,
    lensModel: ''
} as ImageMetaData;
