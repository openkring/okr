import { describe, expect, it } from 'vitest';

import { isHeifBuffer, jpegFileName, MAX_CHAT_HEIC_BYTES, validateChatHeicRequest } from './chat-image.util';

/** A minimal ISO-BMFF header: size, `ftyp`, major brand, padded to 16 bytes. */
function ftyp(brand: string): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp' + brand, 'ascii'), Buffer.alloc(8)]);
}

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
  const data = ftyp('heic').toString('base64');

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

  it('rejects an image above the size limit before decoding it', () => {
    const tooBig = 'A'.repeat(Math.ceil(MAX_CHAT_HEIC_BYTES / 3) * 4 + 4);
    expect(() => validateChatHeicRequest({ fileName: 'a.heic', data: tooBig })).toThrow('Image too large.');
  });
});
