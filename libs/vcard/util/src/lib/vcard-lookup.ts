import { buildVCard, foldVcardLine } from './vcard-generator';
import { ExportScope, VcardRecord } from './vcard-types';

/**
 * The «lookup» profile of the CardDAV mirror (spec 1.159 §6): only what an incoming-call lookup
 * needs — name, nickname, first employer, phones, emails and (inserted at serve time) the photo.
 */
export const LOOKUP_SCOPE: ExportScope = {
  identity: true,
  addresses: ['phone', 'email'],
  birthday: false,
  photo: true, // PHOTO is inserted at serve time (`withPhoto`), never stored in the snapshot
  workRels: true,
  personalRels: false,
  orgLinks: false,
};

/** Render one mirror card without its photo: first employer's name only, no related names. */
export function buildLookupVCard(record: VcardRecord): string {
  const org = record.employment?.org;
  return buildVCard(
    {
      ...record,
      employment: org ? { org } : undefined,
      relatedNames: [],
      photoBase64: undefined,
    },
    LOOKUP_SCOPE,
  );
}

const END = 'END:VCARD\r\n';

/** Insert the folded `PHOTO` line before `END:VCARD`; unchanged without a photo. */
export function withPhoto(vcardText: string, base64: string | undefined): string {
  if (!base64) return vcardText;
  const at = vcardText.lastIndexOf(END);
  if (at < 0) return vcardText;
  return `${vcardText.slice(0, at)}${foldVcardLine(`PHOTO;ENCODING=b;TYPE=JPEG:${base64}`)}\r\n${END}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A card's ETag: changes with its text or with a new avatar (path or version), quoted (§5.3). */
export async function cardEtag(vcardText: string, avatarPath: string, avatarVersion: string): Promise<string> {
  return `"${(await sha256Hex(`${vcardText}\n${avatarPath}\n${avatarVersion}`)).slice(0, 16)}"`;
}

/** The book's `getctag`: a hash over the sorted `uid:etag` lines, so order never matters (§5.3). */
export async function bookCtag(index: Record<string, string>): Promise<string> {
  const lines = Object.entries(index).map(([uid, etag]) => `${uid}:${etag}`).sort();
  return sha256Hex(lines.join('\n'));
}
