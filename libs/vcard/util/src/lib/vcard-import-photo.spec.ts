import { describe, expect, it } from 'vitest';

import { DEFAULT_VCARD_IMPORT_TEXTS } from './vcard-i18n';
import { parseVcards } from './vcard-parser';
import { toImportDraft } from './vcard-import-mapping';
import { detachPhoto, photoMime } from './vcard-import-photo';
import { splitVcardBlocks } from './vcard-import-split';

const PNG = 'iVBORw0KGgo' + 'A'.repeat(40);

describe('photoMime', () => {
  it('recognises png, gif, webp and defaults to jpeg', () => {
    expect(photoMime(PNG).mime).toBe('image/png');
    expect(photoMime('R0lGODlh').mime).toBe('image/gif');
    expect(photoMime('UklGRiQ').mime).toBe('image/webp');
    expect(photoMime('/9j/4AAQ').mime).toBe('image/jpeg');
  });
});

describe('detachPhoto', () => {
  it('replaces base64 with a Blob of the right type', () => {
    const d = detachPhoto({ photoBase64: PNG, displayName: 'x' } as never);
    expect(d.photoBase64).toBeUndefined();
    expect(d.photo).toBeInstanceOf(Blob);
    expect(d.photo?.type).toBe('image/png');
  });

  it('leaves a card without a photo alone', () => {
    const d = detachPhoto({ displayName: 'x' } as never);
    expect(d.photo).toBeUndefined();
  });
});

describe('a 4000-card export with 16 KB photos (spec 1.159 §4.4)', () => {
  it('leaves no base64 string behind in any draft', () => {
    const b64 = '/9j/' + 'A'.repeat(16 * 1024);
    const folded = (b64.match(/.{1,74}/g) ?? []).join('\r\n ');
    let text = '';
    for (let i = 0; i < 4000; i++) {
      text += `BEGIN:VCARD\r\nVERSION:3.0\r\nN:Muster${i};Anna;;;\r\nFN:Anna Muster${i}\r\nTEL;TYPE=CELL:079 123 ${String(i).padStart(4, '0')}\r\nPHOTO;ENCODING=b;TYPE=JPEG:${folded}\r\nEND:VCARD\r\n`;
    }
    const drafts = splitVcardBlocks(text).flatMap((block) =>
      parseVcards(block, 'all.vcf', DEFAULT_VCARD_IMPORT_TEXTS).cards.map((c) =>
        detachPhoto(toImportDraft(c, 'bka', [], '15.11.2026', DEFAULT_VCARD_IMPORT_TEXTS)),
      ),
    );
    expect(drafts).toHaveLength(4000);
    expect(drafts.every((d) => d.photo instanceof Blob && d.photoBase64 === undefined)).toBe(true);
  }, 60_000);
});
