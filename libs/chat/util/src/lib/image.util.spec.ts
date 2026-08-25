import { describe, expect, it } from 'vitest';
import {
  imageMimeTypeForName,
  isImageFileName,
  isSupportedImageFile,
  materializeFile,
  resolveFileMimeType,
} from './image.util';

function file(name: string, type: string): File {
  return new File(['x'], name, { type });
}

describe('imageMimeTypeForName', () => {
  it('maps supported extensions to their canonical MIME type', () => {
    expect(imageMimeTypeForName('IMG_6840.png')).toBe('image/png');
    expect(imageMimeTypeForName('photo.jpg')).toBe('image/jpeg');
    expect(imageMimeTypeForName('photo.jpeg')).toBe('image/jpeg');
    expect(imageMimeTypeForName('logo.svg')).toBe('image/svg+xml');
  });

  it('is case-insensitive (iOS exports .PNG / .HEIC uppercased)', () => {
    expect(imageMimeTypeForName('IMG_6840.PNG')).toBe('image/png');
    expect(imageMimeTypeForName('IMG_0001.HEIC')).toBe('image/heic');
  });

  it('returns undefined for a non-image extension', () => {
    expect(imageMimeTypeForName('report.pdf')).toBeUndefined();
    expect(imageMimeTypeForName('notes')).toBeUndefined();
  });

  it('does not match an extension that merely appears inside the name', () => {
    expect(imageMimeTypeForName('png')).toBeUndefined();
    expect(imageMimeTypeForName('my.png.pdf')).toBeUndefined();
  });
});

describe('isImageFileName', () => {
  it('accepts image extensions and rejects others', () => {
    expect(isImageFileName('a.webp')).toBe(true);
    expect(isImageFileName('a.docx')).toBe(false);
  });
});

describe('resolveFileMimeType', () => {
  it('prefers what the browser reported', () => {
    expect(resolveFileMimeType(file('IMG_6840.png', 'image/png'))).toBe('image/png');
  });

  // The regression: iOS Files/iCloud picker and some Windows drag-and-drop sources hand
  // over a File with an empty type. macOS Chrome never does, which is why this only ever
  // reproduced on other devices.
  it('falls back to the extension when the browser reported no type', () => {
    expect(resolveFileMimeType(file('IMG_6840.png', ''))).toBe('image/png');
    expect(resolveFileMimeType(file('scan.HEIC', ''))).toBe('image/heic');
  });

  it('returns an empty string for an untyped non-image', () => {
    expect(resolveFileMimeType(file('archive.bin', ''))).toBe('');
  });

  it('never overrides an explicit non-image type', () => {
    expect(resolveFileMimeType(file('weird.png', 'application/pdf'))).toBe('application/pdf');
  });
});

describe('isSupportedImageFile', () => {
  it('agrees with resolveFileMimeType for an untyped image — the two must not diverge', () => {
    const f = file('IMG_6840.png', '');
    expect(isSupportedImageFile(f)).toBe(true);
    expect(resolveFileMimeType(f).startsWith('image/')).toBe(true);
  });

  it('rejects a plain document', () => {
    expect(isSupportedImageFile(file('report.pdf', 'application/pdf'))).toBe(false);
  });
});

describe('materializeFile', () => {
  // jsdom's File has no arrayBuffer(); every browser we target does. Stub it so these tests
  // exercise materializeFile itself rather than the environment's File implementation.
  const readable = (bytes: number[], name: string, type: string, reportedSize?: number): File => {
    const f = new File([new Uint8Array(bytes)], name, { type });
    Object.defineProperty(f, 'arrayBuffer', { value: async () => new Uint8Array(bytes).buffer });
    if (reportedSize !== undefined) Object.defineProperty(f, 'size', { value: reportedSize });
    return f;
  };

  it('returns a File with the same bytes, name and type', async () => {
    const result = await materializeFile(readable([1, 2, 3, 4], 'IMG_1224.webp', 'image/webp'));
    expect(result.name).toBe('IMG_1224.webp');
    expect(result.type).toBe('image/webp');
    expect(result.size).toBe(4);
  });

  it('normalises a missing type from the extension', async () => {
    const result = await materializeFile(readable([1], 'IMG_6840.png', ''));
    expect(result.type).toBe('image/png');
  });

  // The whole point: a handle whose backing storage the browser released reads as zero bytes
  // while still reporting the original size. After materialising, `size` tells the truth, so
  // sendFile can refuse the upload instead of posting an event that points at nothing.
  it('reports the real byte count when the underlying read comes back empty', async () => {
    const stale = readable([], 'IMG_6841.jpeg', 'image/jpeg', 140688);
    const result = await materializeFile(stale);
    expect(stale.size).toBe(140688);
    expect(result.size).toBe(0);
  });
});
