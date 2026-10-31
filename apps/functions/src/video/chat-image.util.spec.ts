import { describe, expect, it } from 'vitest';

import { isHeifBuffer, jpegFileName, MAX_CHAT_HEIC_BYTES, MAX_CHAT_HEIC_PIXELS, maxDeclaredPixels, validateChatHeicRequest } from './chat-image.util';

/** A minimal ISO-BMFF header: size, `ftyp`, major brand, padded to 16 bytes. */
function ftyp(brand: string): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp' + brand, 'ascii'), Buffer.alloc(8)]);
}

/** An `ispe` property box declaring width × height. */
function ispe(width: number, height: number): Buffer {
  const box = Buffer.alloc(20);
  box.writeUInt32BE(20, 0);
  box.write('ispe', 4, 'ascii');
  box.writeUInt32BE(width, 12);
  box.writeUInt32BE(height, 16);
  return box;
}

/** A HEIC header with a 512×512 tile and a 4000×3000 grid, like a phone photo. */
const phoneHeic = () => Buffer.concat([ftyp('heic'), ispe(512, 512), ispe(4000, 3000)]);

describe('maxDeclaredPixels', () => {
  it('takes the largest ispe — the grid, not a tile', () => {
    expect(maxDeclaredPixels(phoneHeic())).toBe(12_000_000);
  });

  it('is 0 when no ispe is declared', () => {
    expect(maxDeclaredPixels(ftyp('heic'))).toBe(0);
  });
});

describe('isHeifBuffer', () => {
  it('accepts the HEIC brands phones write', () => {
    expect(isHeifBuffer(ftyp('heic'))).toBe(true);
    expect(isHeifBuffer(ftyp('heix'))).toBe(true);
    expect(isHeifBuffer(ftyp('mif1'))).toBe(true);
  });

  it('rejects other containers and short input', () => {
    expect(isHeifBuffer(ftyp('isom'))).toBe(false);   // mp4
    expect(isHeifBuffer(ftyp('avif'))).toBe(false);   // AVIF decodes in every browser already
    expect(isHeifBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isHeifBuffer(Buffer.alloc(4))).toBe(false);
  });
});

describe('jpegFileName', () => {
  it('swaps a HEIC/HEIF extension, any case', () => {
    expect(jpegFileName('20261031_091141.heic')).toBe('20261031_091141.jpg');
    expect(jpegFileName('IMG_1234.HEIF')).toBe('IMG_1234.jpg');
  });

  it('appends .jpg when there is no HEIC extension', () => {
    expect(jpegFileName('photo')).toBe('photo.jpg');
  });
});

describe('validateChatHeicRequest', () => {
  const data = phoneHeic().toString('base64');

  it('returns the decoded bytes for a valid request', () => {
    const req = validateChatHeicRequest({ fileName: 'a.heic', data });
    expect(req.fileName).toBe('a.heic');
    expect(isHeifBuffer(req.bytes)).toBe(true);
  });

  it('rejects missing or malformed input', () => {
    expect(() => validateChatHeicRequest(null)).toThrow('Missing request data.');
    expect(() => validateChatHeicRequest({ data })).toThrow('Invalid fileName.');
    expect(() => validateChatHeicRequest({ fileName: '../a.heic', data })).toThrow('Invalid fileName.');
    expect(() => validateChatHeicRequest({ fileName: 'a.heic' })).toThrow('Missing image data.');
    expect(() => validateChatHeicRequest({ fileName: 'a.heic', data: ftyp('isom').toString('base64') })).toThrow('Not a HEIC/HEIF image.');
  });

  it('rejects a decompression bomb: small file, huge declared dimensions', () => {
    const bomb = Buffer.concat([ftyp('heic'), ispe(30_000, 30_000)]).toString('base64');
    expect(30_000 * 30_000).toBeGreaterThan(MAX_CHAT_HEIC_PIXELS);
    expect(() => validateChatHeicRequest({ fileName: 'a.heic', data: bomb })).toThrow('Image too large.');
  });

  it('rejects a HEIC that declares no dimensions', () => {
    expect(() => validateChatHeicRequest({ fileName: 'a.heic', data: ftyp('heic').toString('base64') })).toThrow('Image dimensions missing.');
  });

  it('rejects an image above the size limit before decoding it', () => {
    const tooBig = 'A'.repeat(Math.ceil(MAX_CHAT_HEIC_BYTES / 3) * 4 + 4);
    expect(() => validateChatHeicRequest({ fileName: 'a.heic', data: tooBig })).toThrow('Image too large.');
  });
});
