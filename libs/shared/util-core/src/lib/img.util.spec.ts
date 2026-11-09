import { THUMBNAIL_SIZE } from '@okr/shared-constants';
import { ImageConfig, ImageStyle, ImageType } from '@okr/shared-models';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fileUtil from './file.util';
import {
    addImgixParams,
    getDefaultIconUrl,
    getImgFallbackSrc,
    checkUrlType,
    fixHttpUrl,
    getImageType,
    getImgixJpgUrl,
    getImgixJsonUrl,
    getImgixParamsByExtension,
    getImgixPdfUrl,
    getImgixThumbnailUrl,
    getImgixUrl,
    getPosterStyle,
    getImgixUrlWithAutoParams,
    getSizedImgixParamsByExtension,
    toPixelNumber,
    getThumbnailUrl,
    buildOverlayParams,
    getCaptionCss,
    getImageFrameCss,
    toCssLength,
    getCaptionLuminanceUrl,
    getCaptionTone,
    buildOverlayText,
    buildImageCaption,
    appendImgixParams,
    extractCredit,
    IMGIX_JPG_PARAMS,
    IMGIX_JSON_PARAMS,
    IMGIX_PDF_PARAMS,
    IMGIX_THUMBNAIL_PARAMS
} from './img.util';
import * as logUtil from './log.util';

// Mock the file.util module
vi.mock('./file.util', () => ({
  fileExtension: vi.fn(),
  fileLogo: vi.fn(),
  isAudio: vi.fn(),
  isDocument: vi.fn(),
  isImage: vi.fn(),
  isPdf: vi.fn(),
  isStreamingVideo: vi.fn(),
  isVideo: vi.fn()
}));

// Mock the log.util module
vi.mock('./log.util', () => ({
  die: vi.fn(),
  warn: vi.fn()
}));

describe('img.util', () => {
  const mockIsImage = vi.mocked(fileUtil.isImage);
  const mockIsVideo = vi.mocked(fileUtil.isVideo);
  const mockIsStreamingVideo = vi.mocked(fileUtil.isStreamingVideo);
  const mockIsAudio = vi.mocked(fileUtil.isAudio);
  const mockIsPdf = vi.mocked(fileUtil.isPdf);
  const mockIsDocument = vi.mocked(fileUtil.isDocument);
  const mockFileExtension = vi.mocked(fileUtil.fileExtension);
  const mockFileLogo = vi.mocked(fileUtil.fileLogo);
  const mockWarn = vi.mocked(logUtil.warn);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('should have correct constant values', () => {
      expect(IMGIX_PDF_PARAMS).toBe('page=1');
      expect(IMGIX_JPG_PARAMS).toBe('fm=jpg&auto=format,compress,enhance&fit=crop');
      expect(IMGIX_THUMBNAIL_PARAMS).toBe(`fm=jpg&width=${THUMBNAIL_SIZE}&height=${THUMBNAIL_SIZE}&auto=format,compress,enhance&fit=crop`);
      expect(IMGIX_JSON_PARAMS).toBe('fm=json');
    });
  });

  describe('getImageType', () => {
    it('should return Image type for image files', () => {
      mockIsImage.mockReturnValue(true);
      mockIsVideo.mockReturnValue(false);
      mockIsStreamingVideo.mockReturnValue(false);
      mockIsAudio.mockReturnValue(false);
      mockIsPdf.mockReturnValue(false);
      mockIsDocument.mockReturnValue(false);

      const result = getImageType('photo.jpg');

      expect(result).toBe(ImageType.Image);
      expect(mockIsImage).toHaveBeenCalledWith('photo.jpg');
    });

    it('should return Video type for video files (excluding .ts files)', () => {
      mockIsImage.mockReturnValue(false);
      mockIsVideo.mockReturnValue(true);
      mockIsStreamingVideo.mockReturnValue(false);
      mockIsAudio.mockReturnValue(false);
      mockIsPdf.mockReturnValue(false);
      mockIsDocument.mockReturnValue(false);

      const result = getImageType('video.mp4');

      expect(result).toBe(ImageType.Video);
    });

    it('should return Other type for .ts video files (ignored streaming video segments)', () => {
      mockIsImage.mockReturnValue(false);
      mockIsVideo.mockReturnValue(true);
      mockIsStreamingVideo.mockReturnValue(false);
      mockIsAudio.mockReturnValue(false);
      mockIsPdf.mockReturnValue(false);
      mockIsDocument.mockReturnValue(false);

      const result = getImageType('segment.ts');

      expect(result).toBe(ImageType.Other);
    });

    it('should return StreamingVideo type for streaming video files', () => {
      mockIsImage.mockReturnValue(false);
      mockIsVideo.mockReturnValue(false);
      mockIsStreamingVideo.mockReturnValue(true);
      mockIsAudio.mockReturnValue(false);
      mockIsPdf.mockReturnValue(false);
      mockIsDocument.mockReturnValue(false);

      const result = getImageType('playlist.m3u8');

      expect(result).toBe(ImageType.StreamingVideo);
    });

    it('should return Audio type for audio files', () => {
      mockIsImage.mockReturnValue(false);
      mockIsVideo.mockReturnValue(false);
      mockIsStreamingVideo.mockReturnValue(false);
      mockIsAudio.mockReturnValue(true);
      mockIsPdf.mockReturnValue(false);
      mockIsDocument.mockReturnValue(false);

      const result = getImageType('song.mp3');

      expect(result).toBe(ImageType.Audio);
    });

    it('should return Pdf type for PDF files', () => {
      mockIsImage.mockReturnValue(false);
      mockIsVideo.mockReturnValue(false);
      mockIsStreamingVideo.mockReturnValue(false);
      mockIsAudio.mockReturnValue(false);
      mockIsPdf.mockReturnValue(true);
      mockIsDocument.mockReturnValue(false);

      const result = getImageType('document.pdf');

      expect(result).toBe(ImageType.Pdf);
    });

    it('should return Doc type for document files', () => {
      mockIsImage.mockReturnValue(false);
      mockIsVideo.mockReturnValue(false);
      mockIsStreamingVideo.mockReturnValue(false);
      mockIsAudio.mockReturnValue(false);
      mockIsPdf.mockReturnValue(false);
      mockIsDocument.mockReturnValue(true);

      const result = getImageType('document.docx');

      expect(result).toBe(ImageType.Doc);
    });

    it('should return Other type for unknown file types', () => {
      mockIsImage.mockReturnValue(false);
      mockIsVideo.mockReturnValue(false);
      mockIsStreamingVideo.mockReturnValue(false);
      mockIsAudio.mockReturnValue(false);
      mockIsPdf.mockReturnValue(false);
      mockIsDocument.mockReturnValue(false);

      const result = getImageType('unknown.xyz');

      expect(result).toBe(ImageType.Other);
    });
  });

  describe('checkUrlType', () => {
    it('should return undefined for empty or undefined url', () => {
      expect(checkUrlType(undefined)).toBeUndefined();
      expect(checkUrlType('')).toBeUndefined();
      expect(mockWarn).toHaveBeenCalledWith('img.util.checkUrlType -> url is undefined');
    });

    it('should return imgix for imgix URLs', () => {
      const result = checkUrlType('https://bkaiser.imgix.net/image.jpg');
      expect(result).toBe('imgix');
    });

    it('should return https for https URLs', () => {
      const result = checkUrlType('https://example.com/image.jpg');
      expect(result).toBe('https');
    });

    it('should return http for http URLs', () => {
      const result = checkUrlType('http://example.com/image.jpg');
      expect(result).toBe('http');
    });

    it('should return assets for assets paths', () => {
      const result = checkUrlType('assets/images/logo.png');
      expect(result).toBe('assets');
    });

    it('should return storage for storage paths', () => {
      const result = checkUrlType('tenant/images/photo.jpg');
      expect(result).toBe('storage');
    });

    it('should return storage for the shared general/ area (coats of arms, flags)', () => {
      expect(checkUrlType('general/gemeinden/zh/8712_staefa_zh.png')).toBe('storage');
      expect(checkUrlType('general/kantone/zh.svg')).toBe('storage');
      expect(checkUrlType('generalized-key')).toBe('key');
    });

    it('should return key for simple keys', () => {
      const result = checkUrlType('simple-key');
      expect(result).toBe('key');
    });

    it('should handle edge cases', () => {
      expect(checkUrlType('assets-similar')).toBe('key');
      expect(checkUrlType('https-similar')).toBe('key');
      // only paths starting with 'tenant' or 'general/' are classified as storage
      expect(checkUrlType('path/with/multiple/slashes')).toBe('key');
      expect(checkUrlType('tenant/with/multiple/slashes')).toBe('storage');
    });
  });

  describe('fixHttpUrl', () => {
    it('should return undefined for empty or undefined url', () => {
      expect(fixHttpUrl(undefined)).toBeUndefined();
      expect(fixHttpUrl('')).toBeUndefined();
    });

    it('should convert http to https and warn', () => {
      const result = fixHttpUrl('http://example.com/image.jpg');
      
      expect(result).toBe('https://example.com/image.jpg');
      expect(mockWarn).toHaveBeenCalledWith('path is an insecure absolute URL. This is not allowed; protocol is replaced with https.');
    });

    it('should return https URLs unchanged', () => {
      const url = 'https://example.com/image.jpg';
      const result = fixHttpUrl(url);
      
      expect(result).toBe(url);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('should return relative URLs unchanged', () => {
      const url = 'assets/images/logo.png';
      const result = fixHttpUrl(url);
      
      expect(result).toBe(url);
      expect(mockWarn).not.toHaveBeenCalled();
    });
  });

  describe('getImgixUrl', () => {
    it('should return empty string for empty or undefined path', () => {
      expect(getImgixUrl(undefined)).toBe('');
      expect(getImgixUrl('')).toBe('');
    });

    it('should return imgix URLs unchanged', () => {
      const url = 'https://bkaiser.imgix.net/image.jpg?w=100';
      const result = getImgixUrl(url);
      
      expect(result).toBe(url);
    });

    it('should return assets URLs unchanged', () => {
      const url = 'assets/images/logo.png';
      const result = getImgixUrl(url);
      
      expect(result).toBe(url);
    });

    it('should return https URLs unchanged', () => {
      const url = 'https://example.com/image.jpg';
      const result = getImgixUrl(url);
      
      expect(result).toBe(url);
    });

    it('should encode spaces in storage paths (a literal space breaks srcset)', () => {
      const result = getImgixUrl('tenant/scs/section/abc/Bildschirmfoto 2026-08-01.jpg');

      expect(result).toContain('Bildschirmfoto%202026-08-01.jpg');
      expect(result).not.toContain(' ');
    });

    it('should add default params to storage URLs', () => {
      const url = 'tenant/images/photo.jpg';
      const result = getImgixUrl(url);
      
      expect(result).toBe('tenant/images/photo.jpg?auto=compress,enhance');
    });

    it('should add custom params to storage URLs', () => {
      const url = 'tenant/images/photo.jpg';
      const params = 'w=200&h=200';
      const result = getImgixUrl(url, params);
      
      expect(result).toBe('tenant/images/photo.jpg?w=200&h=200');
    });

    it('should convert http to https before processing', () => {
      const url = 'http://example.com/image.jpg';
      const result = getImgixUrl(url);
      
      expect(result).toBe('https://example.com/image.jpg');
      expect(mockWarn).toHaveBeenCalled();
    });

    it('should return an empty string for a key (never throw inside a template computed)', () => {
      expect(getImgixUrl('someDocumentKey')).toBe('');
      expect(mockWarn).toHaveBeenCalled();
    });
  });

  describe('getImgixUrlWithAutoParams', () => {
    it('should use provided imgix params', () => {
      const path = 'tenant/images/photo.jpg';
      const params = 'w=300&h=300';
      
      const result = getImgixUrlWithAutoParams(path, params);
      
      expect(result).toBe('tenant/images/photo.jpg?w=300&h=300');
    });

    it('should use auto-generated params when none provided', () => {
      mockIsImage.mockReturnValue(true);
      mockIsPdf.mockReturnValue(false);
      
      const path = 'tenant/images/photo.jpg';
      const result = getImgixUrlWithAutoParams(path);
      
      expect(result).toBe('tenant/images/photo.jpg?auto=format,compress,enhance&fit=crop');
    });
  });

  describe('getImgixParamsByExtension', () => {
    it('should return PDF params for PDF files', () => {
      mockIsPdf.mockReturnValue(true);
      mockIsImage.mockReturnValue(false);
      
      const result = getImgixParamsByExtension('document.pdf');
      
      expect(result).toBe('page=1');
    });

    it('should return image params for image files', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(true);
      
      const result = getImgixParamsByExtension('photo.jpg');
      
      expect(result).toBe('auto=format,compress,enhance&fit=crop');
    });

    it('should return empty string for other file types', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      
      const result = getImgixParamsByExtension('document.docx');
      
      expect(result).toBe('');
    });
  });

  describe('getSizedImgixParamsByExtension', () => {
    it('should return empty string for empty or undefined path', () => {
      expect(getSizedImgixParamsByExtension(undefined, '100', '100')).toBe('');
      expect(getSizedImgixParamsByExtension('', '100', '100')).toBe('');
    });

    it('should return PDF params with aspect ratio for PDF files', () => {
      mockIsPdf.mockReturnValue(true);
      mockIsImage.mockReturnValue(false);
      
      const result = getSizedImgixParamsByExtension('document.pdf', '200', '300');
      
      expect(result).toBe('page=1&ar=200:300');
    });

    it('should return image params with aspect ratio for image files', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(true);
      
      const result = getSizedImgixParamsByExtension('photo.jpg', '400', '300');
      
      expect(result).toBe('ar=400:300&auto=format,compress,enhance&fit=crop');
    });

    it('should return empty string for other file types', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      
      const result = getSizedImgixParamsByExtension('document.docx', '100', '100');
      
      expect(result).toBe('');
    });

    it('should not crop when a size is not a pixel value', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(true);
      expect(getSizedImgixParamsByExtension('photo.jpg', '100%', 'auto')).toBe('auto=format,compress,enhance&fit=crop');
      expect(getSizedImgixParamsByExtension('photo.jpg', '400px', '300px')).toBe('ar=400:300&auto=format,compress,enhance&fit=crop');
      expect(getSizedImgixParamsByExtension('photo.jpg', '400', 'auto')).not.toContain('ar=');
    });
  });

  describe('toPixelNumber', () => {
    it('reads plain numbers and px as pixels', () => {
      expect(toPixelNumber('300')).toBe(300);
      expect(toPixelNumber('300px')).toBe(300);
      expect(toPixelNumber(' 12.5px ')).toBe(12.5);
      expect(toPixelNumber(800)).toBe(800);
    });

    it('returns undefined for relative or missing sizes', () => {
      expect(toPixelNumber('100%')).toBeUndefined();
      expect(toPixelNumber('50vw')).toBeUndefined();
      expect(toPixelNumber('auto')).toBeUndefined();
      expect(toPixelNumber('')).toBeUndefined();
      expect(toPixelNumber(undefined)).toBeUndefined();
      expect(toPixelNumber('0')).toBeUndefined();
    });
  });

  describe('getThumbnailUrl', () => {
    it('should return imgix URL for images and PDFs', () => {
      mockIsImage.mockReturnValue(true);
      mockIsPdf.mockReturnValue(false);
      
      const result = getThumbnailUrl('tenant/images/photo.jpg', '150', '150');
      
      expect(result).toBe('tenant/images/photo.jpg?ar=150:150&auto=format,compress,enhance&fit=crop');
    });

    it('should return file logo for non-image, non-PDF files', () => {
      mockIsImage.mockReturnValue(false);
      mockIsPdf.mockReturnValue(false);
      mockFileExtension.mockReturnValue('docx');
      mockFileLogo.mockReturnValue('assets/icons/docx.png');
      
      const result = getThumbnailUrl('document.docx', '150', '150');
      
      expect(result).toBe('assets/icons/docx.png');
      expect(mockFileExtension).toHaveBeenCalledWith('document.docx');
      expect(mockFileLogo).toHaveBeenCalledWith('docx');
    });
  });

  describe('addImgixParams', () => {
    it('should add PDF params for PDF files', () => {
      mockIsPdf.mockReturnValue(true);
      mockIsImage.mockReturnValue(false);
      
      const result = addImgixParams('tenant/docs/document.pdf', 100);
      
      expect(result).toBe('tenant/docs/document.pdf?page=1&ar=1:1');
    });

    it('should add face recognition params for images by default', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(true);
      
      const result = addImgixParams('tenant/images/photo.jpg', 200);
      
      expect(result).toBe('tenant/images/photo.jpg?w=200&h=200&fit=crop&crop=faces');
    });

    it('should add standard image params when face recognition is disabled', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(true);
      
      const result = addImgixParams('tenant/images/photo.jpg', 200, false);
      
      expect(result).toBe('tenant/images/photo.jpg?auto=format,compress,enhance&ar=1:1&fit=clamp');
    });

    it('should handle non-image, non-PDF files', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      
      const result = addImgixParams('tenant/docs/document.docx', 100);
      
      expect(result).toBe('tenant/docs/document.docx?');
    });
  });

  describe('imgix URL builders', () => {
    const baseUrl = 'https://bkaiser.imgix.net';
    const imagePath = 'tenant/images/photo.jpg';

    it('should build JPG imgix URL', () => {
      const result = getImgixJpgUrl(imagePath, baseUrl);
      
      expect(result).toBe(`${baseUrl}/${imagePath}?${IMGIX_JPG_PARAMS}`);
    });

    it('should build PDF imgix URL', () => {
      const result = getImgixPdfUrl(imagePath, baseUrl);
      
      expect(result).toBe(`${baseUrl}/${imagePath}?${IMGIX_PDF_PARAMS}`);
    });

    it('should build thumbnail imgix URL', () => {
      const result = getImgixThumbnailUrl(imagePath, baseUrl);
      
      expect(result).toBe(`${baseUrl}/${imagePath}?${IMGIX_THUMBNAIL_PARAMS}`);
    });

    it('should build JSON imgix URL', () => {
      const result = getImgixJsonUrl(imagePath, baseUrl);
      
      expect(result).toBe(`${baseUrl}/${imagePath}?${IMGIX_JSON_PARAMS}`);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle various URL formats', () => {
      expect(checkUrlType('https://bkaiser.imgix.net/deep/path/image.jpg')).toBe('imgix');
      expect(checkUrlType('assets/deep/path/image.jpg')).toBe('assets');
      expect(checkUrlType('tenant/very/deep/path/image.jpg')).toBe('storage');
    });

    it('should handle empty parameters in imgix functions', () => {
      const result = getImgixUrl('tenant/image.jpg', '');
      expect(result).toBe('tenant/image.jpg?');
    });

    it('should handle special characters in paths', () => {
      const path = 'tenant/images/photo with spaces.jpg';
      const result = getImgixUrl(path);
      expect(result).toBe('tenant/images/photo%20with%20spaces.jpg?auto=compress,enhance');
    });

    it('should handle very long paths', () => {
      const longPath = 'tenant/' + 'very/'.repeat(10) + 'deep/path/image.jpg';
      expect(checkUrlType(longPath)).toBe('storage');
    });
  });

  describe('buildImageCaption', () => {
    const img = (over: Partial<ImageConfig> = {}): ImageConfig =>
      ({ label: 'Label', type: ImageType.Image, url: '', actionUrl: '', altText: '', overlay: '', credit: '', ...over });

    it('a) uses the image Untertitel, with the Quelle as second line', () => {
      expect(buildImageCaption(img({ overlay: 'Doppelvierer', credit: 'Foto: Swiss Rowing' }), ['Sub', 'Title']))
        .toEqual({ text: 'Doppelvierer', source: 'Foto: Swiss Rowing' });
      expect(buildImageCaption(img({ overlay: 'Doppelvierer' }), ['Sub'])).toEqual({ text: 'Doppelvierer', source: '' });
    });

    it('b) falls back to the Quelle alone', () => {
      expect(buildImageCaption(img({ credit: 'Foto: Swiss Rowing' }), ['Sub', 'Title']))
        .toEqual({ text: 'Foto: Swiss Rowing', source: '' });
    });

    it('c) and d) fall back to the section subtitle, then the section title', () => {
      expect(buildImageCaption(img(), ['Sub', 'Title'])).toEqual({ text: 'Sub', source: '' });
      expect(buildImageCaption(img(), ['  ', 'Title'])).toEqual({ text: 'Title', source: '' });
      expect(buildImageCaption(img(), [undefined, ''])).toEqual({ text: '', source: '' });
    });

    it('never uses the image label and trims whitespace', () => {
      expect(buildImageCaption(img({ label: 'Sunset' })).text).toBe('');
      expect(buildImageCaption(img({ overlay: '  Sunset  ' })).text).toBe('Sunset');
      expect(buildImageCaption(undefined)).toEqual({ text: '', source: '' });
    });
  });

  describe('buildOverlayText', () => {
    const img = (over: Partial<ImageConfig> = {}): ImageConfig =>
      ({ label: 'Label', type: ImageType.Image, url: '', actionUrl: '', altText: '', overlay: '', credit: '', ...over });

    it('joins Untertitel and Quelle on two lines', () => {
      expect(buildOverlayText(img({ overlay: 'Custom', credit: 'J. Doe' }))).toBe('Custom\nJ. Doe');
    });

    it('shows the Quelle alone, and nothing for an image without either', () => {
      expect(buildOverlayText(img({ credit: 'J. Doe' }))).toBe('J. Doe');
      expect(buildOverlayText(img())).toBe('');
    });
  });

  describe('buildOverlayParams', () => {
    const img = (over: Partial<ImageConfig> = {}): ImageConfig =>
      ({ label: '', type: ImageType.Image, url: '', actionUrl: '', altText: '', overlay: '', credit: '', ...over });

    it('renders nothing when the caption is switched off (the default)', () => {
      expect(buildOverlayParams(img({ overlay: 'Sunset' }), {} as ImageStyle)).toBe('');
      expect(buildOverlayParams(img({ overlay: 'Sunset' }), { captionPosition: 'none' } as ImageStyle)).toBe('');
    });

    it('url-encodes the caption into txt', () => {
      const result = buildOverlayParams(img({ overlay: 'Sunset', credit: 'J. Doe' }), { captionPosition: 'bottom-overlay' } as ImageStyle);
      expect(result).toContain('txt=' + encodeURIComponent('Sunset\nJ. Doe'));
    });

    it('renders nothing for an image without caption text', () => {
      expect(buildOverlayParams(img(), { captionPosition: 'bottom' } as ImageStyle)).toBe('');
    });
  });

  describe('appendImgixParams', () => {
    const url = 'https://bkaiser.imgix.net/tenant/scs/a.jpg?auto=format';
    it('appends the extra parameters after the generated ones', () => {
      expect(appendImgixParams(url, 'sat=-100')).toBe(url + '&sat=-100');
      expect(appendImgixParams(url, '?sat=-100&blur=20')).toBe(url + '&sat=-100&blur=20');
      expect(appendImgixParams('https://bkaiser.imgix.net/a.jpg', '&sat=-100')).toBe('https://bkaiser.imgix.net/a.jpg?sat=-100');
    });

    it('leaves the url alone without parameters or for non-imgix urls', () => {
      expect(appendImgixParams(url, '')).toBe(url);
      expect(appendImgixParams(url, undefined)).toBe(url);
      expect(appendImgixParams('https://example.com/a.jpg', 'sat=-100')).toBe('https://example.com/a.jpg');
    });
  });

  describe('extractCredit', () => {
    it('returns empty string for undefined data', () => {
      expect(extractCredit(undefined)).toBe('');
    });

    it('returns empty string when the file carries no attribution at all', () => {
      // the normal case: phone cameras write no attribution
      expect(extractCredit({})).toBe('');
      expect(extractCredit({ IPTC: {}, TIFF: {} })).toBe('');
    });

    it('prefers the explicit IPTC credit line over everything else', () => {
      const data = {
        IPTC: { Credit: 'Keystone', Byline: 'J. Doe', CopyrightNotice: '© 2026 Agency' },
        TIFF: { Artist: 'Someone Else' }
      };
      expect(extractCredit(data)).toBe('Keystone');
    });

    it('falls back to the IPTC byline when there is no credit line', () => {
      expect(extractCredit({ IPTC: { Byline: 'J. Doe' } })).toBe('J. Doe');
    });

    it('joins multiple byline creators', () => {
      expect(extractCredit({ IPTC: { Byline: ['J. Doe', 'A. Muster'] } })).toBe('J. Doe, A. Muster');
    });

    it('falls back through copyright and source', () => {
      expect(extractCredit({ IPTC: { CopyrightNotice: '© 2026 Agency' } })).toBe('© 2026 Agency');
      expect(extractCredit({ IPTC: { Copyright: '© 2026 Agency' } })).toBe('© 2026 Agency');
      expect(extractCredit({ IPTC: { Source: 'Bildarchiv' } })).toBe('Bildarchiv');
    });

    it('falls back to the EXIF/TIFF artist and copyright tags', () => {
      expect(extractCredit({ TIFF: { Artist: 'J. Doe' } })).toBe('J. Doe');
      expect(extractCredit({ TIFF: { Copyright: '© J. Doe' } })).toBe('© J. Doe');
      // TIFF.Artist wins over TIFF.Copyright
      expect(extractCredit({ TIFF: { Artist: 'J. Doe', Copyright: '© Agency' } })).toBe('J. Doe');
    });

    it('reads the shape imgix actually returns (verified against assets.imgix.net)', () => {
      const kingfisher = {
        IPTC: { Byline: ['Kajornyot Krunkitsatien'], Copyright: 'Kajornyot Krunkitsatien' },
        TIFF: { Artist: 'Kajornyot Krunkitsatien', Copyright: 'Kajornyot Krunkitsatien' }
      };
      expect(extractCredit(kingfisher)).toBe('Kajornyot Krunkitsatien');
    });

    it('ignores blank and whitespace-only values', () => {
      expect(extractCredit({ IPTC: { Credit: '   ', Byline: 'J. Doe' } })).toBe('J. Doe');
      expect(extractCredit({ IPTC: { Byline: [] } })).toBe('');
    });

    it('trims the returned value', () => {
      expect(extractCredit({ IPTC: { Credit: '  Keystone  ' } })).toBe('Keystone');
    });

    it('caps the value at the 150 chars the editors allow', () => {
      const long = 'x'.repeat(300);
      expect(extractCredit({ IPTC: { CopyrightNotice: long } })).toHaveLength(150);
    });
  });
});
describe('getPosterStyle', () => {
  it('uses the signed url verbatim', () => {
    const url = 'https://bkaiser-private.imgix.net/tenant/scs/x.mov?fm=jpg&expires=1&s=abc';
    expect(getPosterStyle(url)['background-image']).toBe(`url(${url})`);
    expect(getPosterStyle(url)['background-size']).toBe('cover');
  });
});

describe('getDefaultIconUrl', () => {
  it('points to the generic avatar by default', () => {
    expect(getDefaultIconUrl('https://x.imgix.net')).toBe('https://x.imgix.net/logo/icons/other.svg');
  });

  it('uses the given icon name', () => {
    expect(getDefaultIconUrl('https://x.imgix.net', 'person')).toBe('https://x.imgix.net/logo/icons/person.svg');
  });
});

describe('getImgFallbackSrc', () => {
  const fallback = 'https://x.imgix.net/logo/icons/other.svg';

  it('switches a failed image to the fallback', () => {
    expect(getImgFallbackSrc('https://x.imgix.net/avatar/broken.jpg', fallback)).toBe(fallback);
  });

  it('gives up when the fallback itself failed, so it never loops', () => {
    expect(getImgFallbackSrc(fallback, fallback)).toBeUndefined();
  });

  it('gives up without a fallback', () => {
    expect(getImgFallbackSrc('https://x.imgix.net/a.jpg', undefined)).toBeUndefined();
    expect(getImgFallbackSrc('https://x.imgix.net/a.jpg', '')).toBeUndefined();
  });
});

// travel journal (spec 1.113, plan 3): local files on the iPad must not be rewritten to imgix
describe('direct image urls', () => {
  const local = 'capacitor://localhost/_capacitor_file_/var/mobile/Documents/journals/j1/a-2048.jpg';

  it('isDirectImageUrl recognises local schemes', async () => {
    const { isDirectImageUrl } = await import('./img.util');
    expect(isDirectImageUrl(local)).toBe(true);
    expect(isDirectImageUrl('file:///var/x.jpg')).toBe(true);
    expect(isDirectImageUrl('blob:capacitor://localhost/abc')).toBe(true);
    expect(isDirectImageUrl('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isDirectImageUrl('https://example.org/x.jpg')).toBe(true);
    expect(isDirectImageUrl('tenant/scs/section/x.jpg')).toBe(false);
    expect(isDirectImageUrl('assets/x.png')).toBe(false);
  });

  it('getImgixUrl passes a capacitor file URL through', async () => {
    const { getImgixUrl } = await import('./img.util');
    expect(getImgixUrl(local)).toBe(local);
  });

  it('getBackgroundStyle uses a direct URL as is', async () => {
    const { getBackgroundStyle } = await import('./img.util');
    const style = getBackgroundStyle('https://bkaiser.imgix.net', { width: '400', height: '300' } as ImageStyle, local);
    expect(style['background-image']).toBe(`url("${local}")`); // quoted: a direct URL may carry characters that end url()
  });
});

describe('collageTiles', () => {
  it('collageTiles lays out 1, 2 and 3 images without gaps in 3 columns', async () => {
    const { collageTiles } = await import('./img.util');
    expect(collageTiles(1)).toEqual([{ index: 0, colSpan: 3, rowSpan: 2 }]);
    expect(collageTiles(2)).toEqual([{ index: 0, colSpan: 2, rowSpan: 2 }, { index: 1, colSpan: 1, rowSpan: 2 }]);
    expect(collageTiles(3)).toEqual([
      { index: 0, colSpan: 2, rowSpan: 2 }, { index: 1, colSpan: 1, rowSpan: 1 }, { index: 2, colSpan: 1, rowSpan: 1 },
    ]);
  });

  it('collageTiles repeats the pattern and closes the remainder', async () => {
    const { collageTiles } = await import('./img.util');
    expect(collageTiles(4).map((t) => [t.colSpan, t.rowSpan])).toEqual([[2, 2], [1, 1], [1, 1], [3, 1]]);
    expect(collageTiles(5).map((t) => [t.colSpan, t.rowSpan])).toEqual([[2, 2], [1, 1], [1, 1], [2, 1], [1, 1]]);
    expect(collageTiles(7).map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(collageTiles(0)).toEqual([]);
  });

  describe('getCaptionCss', () => {
    it('falls back to 0.8rem italic for a legacy style', () => {
      expect(getCaptionCss(undefined)).toEqual({ 'font-size': '0.8rem', 'font-style': 'italic', 'font-weight': 'normal', 'text-align': 'left' });
      expect(getCaptionCss({ captionSize: '  ' } as ImageStyle)['font-size']).toBe('0.8rem');
    });

    it('maps each caption style onto font-style and font-weight', () => {
      const css = (captionStyle: ImageStyle['captionStyle']) => getCaptionCss({ captionStyle } as ImageStyle);
      expect(css('normal')).toMatchObject({ 'font-style': 'normal', 'font-weight': 'normal' });
      expect(css('italic')).toMatchObject({ 'font-style': 'italic', 'font-weight': 'normal' });
      expect(css('bold')).toMatchObject({ 'font-style': 'normal', 'font-weight': '600' });
      expect(css('bold-italic')).toMatchObject({ 'font-style': 'italic', 'font-weight': '600' });
    });

    it('uses the configured alignment', () => {
      expect(getCaptionCss({ captionAlign: 'center' } as ImageStyle)['text-align']).toBe('center');
      expect(getCaptionCss({ captionAlign: 'right' } as ImageStyle)['text-align']).toBe('right');
    });

    it('uses the configured size', () => {
      expect(getCaptionCss({ captionSize: '14px' } as ImageStyle)['font-size']).toBe('14px');
    });
  });

  describe('buildOverlayParams caption position', () => {
    const image = { overlay: 'Hallo' } as ImageConfig;
    it('aligns at the bottom by default and at the top for top positions', () => {
      expect(buildOverlayParams(image, { captionPosition: 'bottom' } as ImageStyle)).toContain('txt-align=bottom,left');
      expect(buildOverlayParams(image, { captionPosition: 'top' } as ImageStyle)).toContain('txt-align=top,left');
      expect(buildOverlayParams(image, { captionPosition: 'top-overlay' } as ImageStyle)).toContain('txt-align=top,left');
    });

    it('places a middle overlay and honours the horizontal alignment', () => {
      expect(buildOverlayParams(image, { captionPosition: 'middle-overlay', captionAlign: 'center' } as ImageStyle)).toContain('txt-align=middle,center');
      expect(buildOverlayParams(image, { captionPosition: 'bottom-overlay', captionAlign: 'right' } as ImageStyle)).toContain('txt-align=bottom,right');
    });
  });

  describe('getCaptionLuminanceUrl', () => {
    const url = 'https://bkaiser.imgix.net/tenant/scs/section/x/image.jpg?auto=format&w=640';
    it('measures only overlay positions', () => {
      expect(getCaptionLuminanceUrl(url, undefined)).toBeUndefined();
      expect(getCaptionLuminanceUrl(url, { captionPosition: 'top' } as ImageStyle)).toBeUndefined();
      expect(getCaptionLuminanceUrl(url, { captionPosition: 'bottom' } as ImageStyle)).toBeUndefined();
    });

    it('crops to the band under the caption and drops the original query', () => {
      expect(getCaptionLuminanceUrl(url, { captionPosition: 'bottom-overlay' } as ImageStyle))
        .toBe('https://bkaiser.imgix.net/tenant/scs/section/x/image.jpg?rect=0,0.8,0.34,0.2&palette=json&colors=1');
      expect(getCaptionLuminanceUrl(url, { captionPosition: 'top-overlay', captionAlign: 'right' } as ImageStyle))
        .toContain('rect=0.66,0,0.34,0.2');
      expect(getCaptionLuminanceUrl(url, { captionPosition: 'middle-overlay', captionAlign: 'center' } as ImageStyle))
        .toContain('rect=0.33,0.4,0.34,0.2');
    });

    it('ignores images that are not served by imgix', () => {
      expect(getCaptionLuminanceUrl('https://example.com/a.jpg', { captionPosition: 'bottom-overlay' } as ImageStyle)).toBeUndefined();
    });
  });

  describe('getCaptionTone', () => {
    it('picks dark text only for a measurably light band', () => {
      expect(getCaptionTone(undefined)).toBe('dark');
      expect(getCaptionTone(0.24)).toBe('dark');
      expect(getCaptionTone(0.55)).toBe('dark');
      expect(getCaptionTone(0.8)).toBe('light');
    });
  });

  describe('toCssLength', () => {
    it('reads a plain number as px and passes css values through', () => {
      expect(toCssLength('4')).toBe('4px');
      expect(toCssLength('2.5')).toBe('2.5px');
      expect(toCssLength('4px')).toBe('4px');
      expect(toCssLength('50%')).toBe('50%');
      expect(toCssLength('  ')).toBeUndefined();
      expect(toCssLength(undefined)).toBeUndefined();
    });
  });

  describe('getImageFrameCss', () => {
    it('applies border and radius as given', () => {
      expect(getImageFrameCss({ border: '1px solid', borderRadius: '4px' } as ImageStyle))
        .toEqual({ 'border': '1px solid', 'border-radius': '4px' });
    });

    it('keeps legacy values working', () => {
      // '1px' has no line style and so draws no border, as before; '4' becomes 4px
      expect(getImageFrameCss({ border: '1px', borderRadius: '4' } as ImageStyle))
        .toEqual({ 'border': '1px', 'border-radius': '4px' });
    });

    it('is empty for a style without frame settings', () => {
      expect(getImageFrameCss(undefined)).toEqual({});
      expect(getImageFrameCss({ border: '', borderRadius: '' } as ImageStyle)).toEqual({});
    });
  });
});
