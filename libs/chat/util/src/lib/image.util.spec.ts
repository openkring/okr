import { describe, expect, it } from 'vitest';
import {
  imageMimeTypeForName,
  isImageFileName,
  isSupportedImageFile,
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
