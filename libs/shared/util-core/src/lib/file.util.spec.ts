import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCEPT_ATTRIBUTE, DEFAULT_MIMETYPES, RAG_ACCEPT_ATTRIBUTE } from '@okr/shared-constants';
import { baseName, dirName, fileExtension, fileName, FileUnreadableError, fileSizeUnit, isPdf, isPickerCancellation, isVideo, readFileIntoMemory, resolveMimeType, sanitizeFileName, suffixFileName, withResolvedMimeType } from './file.util';

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

    // isPickerCancellation
    it('isPickerCancellation detects the native iOS cancel message.', () => {
        expect(isPickerCancellation({ message: 'User cancelled photos app' })).toBe(true);
    });
    it('isPickerCancellation detects a cancelled native file picker (SCS-KV).', () => {
        expect(isPickerCancellation(new Error('pickFiles canceled.'))).toBe(true);
    });
    it('isPickerCancellation is case-insensitive.', () => {
        expect(isPickerCancellation({ message: 'User Cancelled Photos App' })).toBe(true);
    });
    it('isPickerCancellation handles an Error instance.', () => {
        expect(isPickerCancellation(new Error('User cancelled photos app'))).toBe(true);
    });
    it('isPickerCancellation handles a plain string.', () => {
        expect(isPickerCancellation('User cancelled photos app')).toBe(true);
    });
    it('isPickerCancellation returns false for a genuine error.', () => {
        expect(isPickerCancellation({ message: 'No camera available' })).toBe(false);
    });
    it('isPickerCancellation returns false for undefined / null / non-message objects.', () => {
        expect(isPickerCancellation(undefined)).toBe(false);
        expect(isPickerCancellation(null)).toBe(false);
        expect(isPickerCancellation({})).toBe(false);
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

describe('suffixFileName', () => {
  it('should insert the suffix before the extension, not after it', () => {
    expect(suffixFileName('IMG_0042.mov', 'a7f3')).toBe('IMG_0042-a7f3.mov');
  });

  it('should keep the extension intact so mime resolution still works', () => {
    // the whole point: resolveMimeType and the storage.rules extension gate must still see .mov
    expect(resolveMimeType(suffixFileName('IMG_0042.mov', 'a7f3'), '')).toBe('video/quicktime');
  });

  it('should use the LAST dot, so a dotted base name survives', () => {
    expect(suffixFileName('urlaub.2026.sommer.mp4', 'b2c1')).toBe('urlaub.2026.sommer-b2c1.mp4');
  });

  it('should append at the end when there is no extension', () => {
    expect(suffixFileName('README', 'x1')).toBe('README-x1');
  });

  it('should append at the end for a dotfile, whose leading dot starts the name', () => {
    expect(suffixFileName('.env', 'x1')).toBe('.env-x1');
  });

  it('should return the name unchanged for an empty suffix', () => {
    expect(suffixFileName('IMG_0042.mov', '')).toBe('IMG_0042.mov');
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

describe('video formats', () => {
  it('accepts mp4 and quicktime as upload mime types', () => {
    expect(DEFAULT_MIMETYPES).toContain('video/mp4');
    expect(DEFAULT_MIMETYPES).toContain('video/quicktime');
  });

  it('carries the bare extensions in the accept attribute only', () => {
    expect(DEFAULT_ACCEPT_ATTRIBUTE).toContain('.mp4');
    expect(DEFAULT_ACCEPT_ATTRIBUTE).toContain('.mov');
    // the native FilePicker takes DEFAULT_MIMETYPES and rejects bare extensions
    expect(DEFAULT_MIMETYPES.some((t) => t.startsWith('.'))).toBe(false);
  });

  it('classifies both containers as video', () => {
    expect(isVideo('clip.mp4')).toBe(true);
    expect(isVideo('clip.mov')).toBe(true);
  });
});

describe('withResolvedMimeType', () => {
  it('fills the type of a HEIC photo the browser could not decode (Chrome/Firefox report "")', () => {
    const file = withResolvedMimeType(new File(['x'], 'IMG_0042.heic', { type: '' }));
    expect(file.type).toBe('image/heic');
    expect(file.name).toBe('IMG_0042.heic');
    expect(file.size).toBe(1);
  });

  it('keeps a file whose type the browser already knows (same instance)', () => {
    const file = new File(['x'], 'rechnung.pdf', { type: 'application/pdf' });
    expect(withResolvedMimeType(file)).toBe(file);
  });

  it('keeps a file whose extension is unknown', () => {
    const file = new File(['x'], 'README', { type: '' });
    expect(withResolvedMimeType(file)).toBe(file);
  });
});

describe('readFileIntoMemory', () => {
  /** A File handle with the given read behaviour (jsdom's own File need not implement arrayBuffer). */
  function handle(name: string, type: string, size: number, read: () => Promise<ArrayBuffer>): File {
    const file = new File(['x'], name, { type, lastModified: 42 });
    Object.defineProperty(file, 'size', { value: size });
    Object.defineProperty(file, 'arrayBuffer', { value: read });
    return file;
  }

  it('returns a new file with the same name, type, size and date', async () => {
    const source = handle('rechnung.pdf', 'application/pdf', 3, async () => new Uint8Array([1, 2, 3]).buffer);
    const result = await readFileIntoMemory(source);
    expect(result).not.toBe(source);
    expect([result.name, result.type, result.size, result.lastModified]).toEqual(['rechnung.pdf', 'application/pdf', 3, 42]);
  });

  it('resolves a missing type from the extension', async () => {
    const result = await readFileIntoMemory(handle('beleg.heic', '', 1, async () => new Uint8Array([1]).buffer));
    expect(result.type).toBe('image/heic');
  });

  it('rejects a file the browser cannot read any more', async () => {
    const source = handle('rechnung.pdf', 'application/pdf', 3, () => Promise.reject(new Error('gone')));
    await expect(readFileIntoMemory(source)).rejects.toBeInstanceOf(FileUnreadableError);
  });

  it('rejects a truncated and an empty read', async () => {
    const truncated = handle('a.pdf', 'application/pdf', 5, async () => new Uint8Array([1, 2]).buffer);
    const empty = handle('b.pdf', 'application/pdf', 0, async () => new ArrayBuffer(0));
    await expect(readFileIntoMemory(truncated)).rejects.toBeInstanceOf(FileUnreadableError);
    await expect(readFileIntoMemory(empty)).rejects.toBeInstanceOf(FileUnreadableError);
  });
});

describe('rag upload formats', () => {
  const accepted = RAG_ACCEPT_ATTRIBUTE.split(',');

  it('offers markdown and plain text, by type and by extension', () => {
    expect(accepted).toEqual(expect.arrayContaining(['text/markdown', '.md', '.markdown', 'text/plain', '.txt']));
  });

  it('still offers pdf', () => {
    expect(accepted).toEqual(expect.arrayContaining(['application/pdf', '.pdf']));
  });

  it('leaves out what the rag store cannot index', () => {
    expect(accepted.some((t) => t.startsWith('video/') || t.startsWith('image/') || t.includes('zip'))).toBe(false);
  });

  it('recognises a pdf by its name, whatever the case', () => {
    expect(isPdf('protokoll.pdf')).toBe(true);
    expect(isPdf('PROTOKOLL.PDF')).toBe(true);
    expect(isPdf('protokoll.md')).toBe(false);
  });
});
