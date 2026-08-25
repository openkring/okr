import { describe, expect, it } from 'vitest';
import { baseName, dirName, fileExtension, fileName, fileSizeUnit, isPhotoCancellation, resolveMimeType, sanitizeFileName } from './file.util';

describe('file.util', () => {

    // basename
    it('fileName("path/to/a/baseName.txt") should be baseName.txt.', () => {
        const result = fileName('path/to/a/baseName.txt');
        expect(result).toEqual('baseName.txt');
    });
    it('fileName("path_to_a_baseName.txt", "_") should be baseName.txt.', () => {
        const result = fileName('path_to_a_baseName.txt', '_');
        expect(result).toEqual('baseName.txt');
    });
    it('fileName("path\\to\\a\\baseName.txt", "\\") should be baseName.txt.', () => {
        const result = fileName('path\\to\\a\\baseName.txt', '\\');
        expect(result).toEqual('baseName.txt');
    });
    it('fileName("baseName.txt") should be baseName.txt.', () => {
        const result = fileName('baseName.txt');
        expect(result).toEqual('baseName.txt');
    });
    it('baseName("baseName.ext") should be baseName', () => {
        const result = baseName('baseName.ext');
        expect(result).toEqual('baseName');
    });
    it('baseName("/path/to/a/baseName.ext") should be baseName.', () => {
        const result = baseName('/path/to/a/baseName.ext');
        expect(result).toEqual('baseName');
    });
    it('baseName(".ext") should be empty.', () => {
      const result = baseName('.ext');
      expect(result).toEqual('');
    });

    // dirName
    it('dirName("path/to/a/baseName.ext") should be path/to/a.', () => {
        const result = dirName('path/to/a/baseName.ext');
        expect(result).toEqual('path/to/a');
    });
    it('dirName("path_to_a_baseName.ext", "_") should be path_to_a.', () => {
        const result = dirName('path_to_a_baseName.ext', '_');
        expect(result).toEqual('path_to_a');
    });
    it('dirName("path\\to\\a\\baseName.ext", "\\") should be path\\to\\a.', () => {
        const result = dirName('path\\to\\a\\baseName.ext', '\\');
        expect(result).toEqual('path\\to\\a');
    });
    it('dirName("baseName.ext") should be empty string.', () => {
        const result = dirName('baseName.ext');
        expect(result).toEqual('');
    });
    it('dirName("baseName") should be empty string.', () => {
        const result = dirName('baseName');
        expect(result).toEqual('');
    });
    it('dirName(".ext") should be empty.', () => {
        const result = dirName('.ext');
        expect(result).toEqual('');
    });

    // fileExtension
    it('fileExtension("/path/to/a/baseName.ext") should be ext.', () => {
        const result = fileExtension('/path/to/a/baseName.ext');
        expect(result).toEqual('ext');
    });
    it('fileExtension("path/to/a/baseName.ext") should be ext.', () => {
        const result = fileExtension('path/to/a/baseName.ext');
        expect(result).toEqual('ext');
    });
    it('fileExtension("baseName.ext") should be ext.', () => {
        const result = fileExtension('baseName.ext');
        expect(result).toEqual('ext');
    });
    it('fileExtension("") should be empty string.', () => {
        const result = fileExtension('');
        expect(result).toEqual('');
    });
    it('fileExtension("part.part.part.txt") should be ext.', () => {
        const result = fileExtension('part.part.part.ext');
        expect(result).toEqual('ext');
    });

    // fileSizeUnit
    it('fileSizeUnit() should be 0 bytes.', () => {
        const result = fileSizeUnit();
        expect(result).toEqual('0.00 bytes');
    });
    it('fileSizeUnit(1024, 0) should be 1 KB.', () => {
        const result = fileSizeUnit(1024, 0);
        expect(result).toEqual('1 KB');
    });
    it('fileSizeUnit(1035) should be 1.01 KB.', () => {
        const result = fileSizeUnit(1035);
        expect(result).toEqual('1.01 KB');
    });
    it('fileSizeUnit(1135, 3) should be 1.108 KB.', () => {
        const result = fileSizeUnit(1135, 3);
        expect(result).toEqual('1.108 KB');
    });
    it('fileSizeUnit(1025, 3) should be 1.000 KB.', () => {
        const result = fileSizeUnit(1025, 3);
        expect(result).toEqual('1.001 KB'); // rounded from 1.0009
    });
    it('fileSizeUnit(1025, 4) should be 1.0009 KB (rounded from 1.000976).', () => {
        const result = fileSizeUnit(1025, 4);
        expect(result).toEqual('1.0010 KB');
    });
    it('fileSizeUnit(1035, 0) should be 1 KB.', () => {
        const result = fileSizeUnit(1035, 0);
        expect(result).toEqual('1 KB');
    });
    it('fileSizeUnit(1048576) should be 1.00 MB.', () => {
        const result = fileSizeUnit(1048576);
        expect(result).toEqual('1.00 MB');
    });
    it('fileSizeUnit(1073741824) should be 1 GB.', () => {
        const result = fileSizeUnit(1073741824);
        expect(result).toEqual('1.00 GB');
    });
    it('fileSizeUnit(1073741924) should be 1 GB.', () => {
        const result = fileSizeUnit(1073741824);
        expect(result).toEqual('1.00 GB');
    });
    it('fileSizeUnit(1073741924, 6) should be 1 GB.', () => {
        const result = fileSizeUnit(1073741824, 6);
        expect(result).toEqual('1.000000 GB');
    });

    // isPhotoCancellation
    it('isPhotoCancellation detects the native iOS cancel message.', () => {
        expect(isPhotoCancellation({ message: 'User cancelled photos app' })).toBe(true);
    });
    it('isPhotoCancellation is case-insensitive.', () => {
        expect(isPhotoCancellation({ message: 'User Cancelled Photos App' })).toBe(true);
    });
    it('isPhotoCancellation handles an Error instance.', () => {
        expect(isPhotoCancellation(new Error('User cancelled photos app'))).toBe(true);
    });
    it('isPhotoCancellation handles a plain string.', () => {
        expect(isPhotoCancellation('User cancelled photos app')).toBe(true);
    });
    it('isPhotoCancellation returns false for a genuine error.', () => {
        expect(isPhotoCancellation({ message: 'No camera available' })).toBe(false);
    });
    it('isPhotoCancellation returns false for undefined / null / non-message objects.', () => {
        expect(isPhotoCancellation(undefined)).toBe(false);
        expect(isPhotoCancellation(null)).toBe(false);
        expect(isPhotoCancellation({})).toBe(false);
    });
});
describe('sanitizeFileName', () => {
  it('should replace spaces so the name is srcset-safe', () => {
    expect(sanitizeFileName('Bildschirmfoto 2026-08-01.jpg')).toBe('Bildschirmfoto-2026-08-01.jpg');
  });

  it('should fold umlauts and accents to ascii', () => {
    expect(sanitizeFileName('Grün Café.png')).toBe('Grun-Cafe.png');
  });

  it('should collapse runs of unsafe characters and keep the extension', () => {
    expect(sanitizeFileName('a // b ?? c.pdf')).toBe('a-b-c.pdf');
  });

  it('should leave an already safe name unchanged', () => {
    expect(sanitizeFileName('logo_v2-final.svg')).toBe('logo_v2-final.svg');
  });

  it('should never return an empty name', () => {
    expect(sanitizeFileName('***')).toBe('file');
  });
});

describe('resolveMimeType', () => {
  it('should keep the mime type the browser reported', () => {
    expect(resolveMimeType('IMG_0001.HEIC', 'image/heic')).toBe('image/heic');
    expect(resolveMimeType('scan.pdf', 'application/pdf')).toBe('application/pdf');
  });

  it('should derive the mime type from the extension when the browser reports none', () => {
    // Chrome/Firefox cannot decode HEIC and hand over a File with an empty type
    expect(resolveMimeType('IMG_0001.heic', '')).toBe('image/heic');
    expect(resolveMimeType('IMG_0001.HEIC', undefined)).toBe('image/heic');
    expect(resolveMimeType('photo.webp', '')).toBe('image/webp');
    expect(resolveMimeType('photo.jpg', '')).toBe('image/jpeg');
  });

  it('should work on a full storage path, not just a bare file name', () => {
    expect(resolveMimeType('tenant/scs/section/1/album/photo.heif', '')).toBe('image/heif');
  });

  it('should return an empty string for an unknown extension', () => {
    expect(resolveMimeType('mystery.qqq', '')).toBe('');
  });
});
