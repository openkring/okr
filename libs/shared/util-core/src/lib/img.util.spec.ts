import { THUMBNAIL_SIZE } from '@bk2/shared-constants';
import { Image, ImageType } from '@bk2/shared-models';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fileUtil from './file.util';
import {
    addImgixParams,
    checkUrlType,
    fixHttpUrl,
    getImageType,
    getImgixJpgUrl,
    getImgixJsonUrl,
    getImgixParamsByExtension,
    getImgixPdfUrl,
    getImgixThumbnailUrl,
    getImgixUrl,
    getImgixUrlFromImage,
    getImgixUrlWithAutoParams,
    getSizedImgixParamsByExtension,
    getThumbnailUrl,
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
  const mockDie = vi.mocked(logUtil.die);
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

    it('should return key for simple keys', () => {
      const result = checkUrlType('simple-key');
      expect(result).toBe('key');
    });

    it('should handle edge cases', () => {
      expect(checkUrlType('assets-similar')).toBe('key');
      expect(checkUrlType('https-similar')).toBe('key');
      expect(checkUrlType('path/with/multiple/slashes')).toBe('storage');
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
      expect(getSizedImgixParamsByExtension(undefined, 100, 100)).toBe('');
      expect(getSizedImgixParamsByExtension('', 100, 100)).toBe('');
    });

    it('should return PDF params with aspect ratio for PDF files', () => {
      mockIsPdf.mockReturnValue(true);
      mockIsImage.mockReturnValue(false);
      
      const result = getSizedImgixParamsByExtension('document.pdf', 200, 300);
      
      expect(result).toBe('page=1&ar=200:300');
    });

    it('should return image params with aspect ratio for image files', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(true);
      
      const result = getSizedImgixParamsByExtension('photo.jpg', 400, 300);
      
      expect(result).toBe('ar=400:300&auto=format,compress,enhance&fit=crop');
    });

    it('should return empty string for other file types', () => {
      mockIsPdf.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      
      const result = getSizedImgixParamsByExtension('document.docx', 100, 100);
      
      expect(result).toBe('');
    });
  });

  describe('getThumbnailUrl', () => {
    it('should return imgix URL for images and PDFs', () => {
      mockIsImage.mockReturnValue(true);
      mockIsPdf.mockReturnValue(false);
      
      const result = getThumbnailUrl('tenant/images/photo.jpg', 150, 150);
      
      expect(result).toBe('tenant/images/photo.jpg?ar=150:150&auto=format,compress,enhance&fit=crop');
    });

    it('should return file logo for non-image, non-PDF files', () => {
      mockIsImage.mockReturnValue(false);
      mockIsPdf.mockReturnValue(false);
      mockFileExtension.mockReturnValue('docx');
      mockFileLogo.mockReturnValue('assets/icons/docx.png');
      
      const result = getThumbnailUrl('document.docx', 150, 150);
      
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

  describe('getImgixUrlFromImage', () => {
    it('should return imgix URL with dimensions from Image object', () => {
      mockIsImage.mockReturnValue(true);
      mockIsPdf.mockReturnValue(false);
      
      const image: Image = {
        url: 'tenant/images/photo.jpg',
        width: 800,
        height: 600,
        imageLabel: 'photo_with_height_and_width.jpg'
      };
      
      const result = getImgixUrlFromImage(image);
      
      expect(result).toBe('tenant/images/photo.jpg?ar=800:600&auto=format,compress,enhance&fit=crop');
    });

    it('should call die when width or height is missing', () => {
      const image: Image = {
        url: 'tenant/images/photo.jpg',
        width: undefined,
        height: 600,
        imageLabel: 'photo_without_width.jpg',
      };
      
      getImgixUrlFromImage(image);
      
      expect(mockDie).toHaveBeenCalledWith('img.util.getImgixUrlFromImage -> image width and height must be set');
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
      expect(result).toBe('tenant/images/photo with spaces.jpg?auto=compress,enhance');
    });

    it('should handle very long paths', () => {
      const longPath = 'tenant/' + 'very/'.repeat(10) + 'deep/path/image.jpg';
      expect(checkUrlType(longPath)).toBe('storage');
    });
  });
});