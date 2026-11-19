/// <reference lib="dom" />
import { logger } from 'firebase-functions/v2';
import { AvatarCollection } from '@okr/shared-models';
import { classifyStoreDate, convertDateFormatToString, DateFormat, residenceStatus, zurichStoreDate } from '@okr/shared-util-core';
// countries-list lives here rather than in shared-util-core: the browser has no caller for it,
// and a re-export from that barrel pulled its 45 KB into every app bundle (spec 1.49, F1).
import { countries } from 'countries-list';
import {
  ExportScope,
  toAppleRelationLabel,
  VcardChannel,
  VcardChannelType,
  VcardEmployment,
  VcardRecord,
  VcardRelatedName,
  VcardTargetKind,
} from '@okr/vcard-util';

/**
 * The pure half of a vCard record (spec 4.97 §7, 1.159 §5.4): everything `vcardExport` and the
 * CardDAV book rebuild do with a person's or org's data once it is READ. The two callers read
 * differently (one record at a time vs. the whole tenant in bulk) but must never render
 * differently — so the rendering lives here, once.
 */

const IMGIX_BASE = 'https://bkaiser.imgix.net';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FsData = Record<string, any>;

export function mapAddressChannel(addressChannel: string | undefined): VcardChannelType | undefined {
  switch (addressChannel) {
    case 'email':
    case 'phone':
    case 'postal':
    case 'web':
      return addressChannel;
    default:
      return undefined; // 'custom' and unknowns are not vCard channels
  }
}

/** Resolve a display country name (English, per spec example) from an ISO alpha-2 code. */
function countryDisplayName(countryCode: string | undefined): string {
  if (!countryCode) return '';
  const data = countries[countryCode.toUpperCase() as keyof typeof countries];
  return data?.name || countryCode;
}

function usageToType(channel: VcardChannelType, usage: string | undefined): string | undefined {
  const u = (usage ?? '').toLowerCase();
  if (channel === 'phone') {
    if (u === 'mobile' || u === 'cell') return 'CELL';
    if (u === 'fax') return 'FAX';
  }
  if (u === 'work') return 'WORK';
  if (u === 'home' || u === 'private') return 'HOME';
  return undefined;
}

export function buildChannels(addresses: FsData[], scope: ExportScope, favoritesOnly: boolean, today = zurichStoreDate()): VcardChannel[] {
  const channels: VcardChannel[] = [];
  // Spec 1.164 §7.3: only the CURRENT residence is exported — a past or future postal row is history
  // / not yet true. A favorite flag on a past row (before the nightly switch) must not hide the current one.
  const isCurrentPostal = (a: FsData): boolean =>
    a['addressChannel'] === 'postal' && !a['isArchived'] && residenceStatus({ validFrom: a['validFrom'] ?? '', validTo: a['validTo'] ?? '' }, today) === 'current';
  const currentPostal = addresses.filter(isCurrentPostal);
  const currentPostalFavorite = currentPostal.find((a) => a['isFavorite'] === true) ?? currentPostal[0];
  for (const a of addresses) {
    if (a['addressChannel'] === 'postal') {
      if (!isCurrentPostal(a)) continue;
      if (favoritesOnly && a !== currentPostalFavorite) continue;
    } else if (favoritesOnly && a['isFavorite'] !== true) continue;
    const channel = mapAddressChannel(a['addressChannel']);
    if (!channel || !scope.addresses.includes(channel)) continue;
    const type = usageToType(channel, a['addressUsage']);
    const pref = a['isFavorite'] === true;
    switch (channel) {
      case 'email':
        if (a['email']) channels.push({ channel, type, pref, value: String(a['email']) });
        break;
      case 'phone':
        if (a['phone']) channels.push({ channel, type, pref, value: String(a['phone']) });
        break;
      case 'web':
        if (a['url']) {
          const label = a['addressChannelLabel'] && a['addressChannelLabel'] !== '' ? a['addressChannelLabel'] : undefined;
          channels.push({ channel, type, pref, value: String(a['url']), label });
        }
        break;
      case 'postal': {
        const street = [a['streetName'], a['streetNumber']].filter((p) => !!p).join(' ').trim();
        channels.push({ channel, type, pref, street, city: a['city'], zip: a['zipCode'], country: countryDisplayName(a['countryCode']) });
        break;
      }
    }
  }
  return channels;
}

/**
 * Convert a dob StoreDate into the vCard BDAY ISO date, or undefined when there is nothing
 * renderable. Gated on classifyStoreDate === 'full': a partial dob (year-only '19850000', or a
 * birthday without a year '00000415' — the primary motivating case for this feature, imported
 * legacy member lists that carry only a year) reaches convertDateFormatToString's
 * isStrict=false escape hatch, but parseDate only returns null for the end-future sentinel —
 * a partial value parses to an Invalid Date, not null — so format() would throw
 * RangeError: Invalid time value and fail the whole vcardExport batch for one such person.
 *
 * A future vCard 4.0 `BDAY:--0415` form could represent a year-unknown birthday; that is a
 * product decision left to the human, so a non-full dob simply omits BDAY for now.
 */
export function resolveBdayIso(dob: string | undefined): string | undefined {
  if (!dob || classifyStoreDate(dob) !== 'full') return undefined;
  const iso = convertDateFormatToString(dob, DateFormat.StoreDate, DateFormat.IsoDate, false);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
}

/** The imgix-rendered 256 px JPEG of a stored avatar, base64; undefined when it cannot be fetched. */
export async function fetchAvatarBase64ByPath(storagePath: string, signal?: AbortSignal): Promise<string | undefined> {
  const url = `${IMGIX_BASE}/${storagePath}?fm=jpg&w=256&h=256&fit=crop&crop=faces&auto=compress`;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) {
      logger.warn(`vcard: avatar fetch returned ${resp.status}`);
      return undefined;
    }
    return Buffer.from(await resp.arrayBuffer()).toString('base64');
  } catch (e) {
    logger.warn('vcard: avatar fetch failed', e as Error);
    return undefined;
  }
}

/**
 * The avatar doc ids of a subject, preferred first: the tenant's own picture
 * (`<tenant>.<modelType>.<okey>`, what `newAvatarModel` writes — the vCard import included),
 * then the shared default (`<modelType>.<okey>`).
 */
export function avatarDocIds(tenantId: string, kind: string, key: string): [string, string] {
  return [`${tenantId}.${kind}.${key}`, `${kind}.${key}`];
}

/** The subject's avatar, fetched through imgix — the tenant's own picture if there is one. */
export async function fetchAvatarBase64(db: FirebaseFirestore.Firestore, tenantId: string, kind: string, key: string): Promise<string | undefined> {
  const snaps = await db.getAll(...avatarDocIds(tenantId, kind, key).map((id) => db.collection(AvatarCollection).doc(id)));
  const storagePath = snaps.map((s) => s.get('storagePath') as string | undefined).find((p) => !!p);
  return storagePath ? fetchAvatarBase64ByPath(storagePath) : undefined;
}

export interface VcardRecordInput {
  kind: VcardTargetKind;
  key: string;
  /** the person or org document */
  data: FsData;
  /** tenant-scoped addresses AFTER the privacy projection */
  addresses: FsData[];
  /** tenant-scoped workrels: person → employer (subjectKey), org → workers (objectKey) */
  workrels: FsData[];
  /** tenant-scoped personal rels in which the person is subject / object */
  personalRels?: { subject: FsData[]; object: FsData[] };
  scope: ExportScope;
  favoritesOnly: boolean;
  photoBase64?: string;
  /** the Zurich calendar day (zurichStoreDate) that decides which postal row is current */
  today?: string;
}

/** Shape an already-read person or org into a `VcardRecord` (no I/O). */
export function toVcardRecord(input: VcardRecordInput): VcardRecord {
  const { kind, key, data, addresses, scope, favoritesOnly, photoBase64, today } = input;
  const channels = buildChannels(addresses, scope, favoritesOnly, today ?? zurichStoreDate());
  const relatedNames: VcardRelatedName[] = [];
  const uid = `${kind}-${key}`;

  if (kind === 'person') {
    const displayName = `${data['firstName'] ?? ''} ${data['lastName'] ?? ''}`.trim() || (data['lastName'] ?? key);
    let employment: VcardEmployment | undefined;
    let bday: string | undefined;

    if (scope.birthday) {
      // ONLY the projected dob vault channel — `addresses` has already been privacy-filtered for
      // this caller's tier; the person document itself carries no dob (privacy 1.19 Phase 4).
      const dobAddr = addresses.find((a) => a['addressChannel'] === 'dob');
      // defensive coercion: a legacy Firestore doc could hold a non-string dob value
      bday = resolveBdayIso(String(dobAddr?.['dob'] ?? ''));
    }

    if (scope.workRels) {
      // stable order: most recent startDate first, else array order
      const workrels = [...input.workrels].sort((a, b) => `${b['validFrom'] ?? ''}`.localeCompare(`${a['validFrom'] ?? ''}`));
      workrels.forEach((w, i) => {
        if (i === 0) {
          employment = { org: w['objectName'], title: w['label'] || w['name'] || undefined, role: w['type'] || undefined };
        } else {
          relatedNames.push({ name: w['objectName'], label: w['label'] || 'Employer' });
        }
      });
    }

    if (scope.personalRels && input.personalRels) {
      const seen = new Set<FsData>();
      const collect = (rels: FsData[], asSubject: boolean) => {
        for (const r of rels) {
          if (seen.has(r)) continue;
          seen.add(r);
          const name = asSubject
            ? `${r['objectFirstName'] ?? ''} ${r['objectLastName'] ?? ''}`.trim()
            : `${r['subjectFirstName'] ?? ''} ${r['subjectLastName'] ?? ''}`.trim();
          if (!name) continue;
          relatedNames.push({ name, label: toAppleRelationLabel(r['type'], r['label']) });
        }
      };
      collect(input.personalRels.subject, true);
      collect(input.personalRels.object, false);
    }

    return {
      kind,
      uid,
      nickname: data['nickname'] || undefined,
      firstName: data['firstName'],
      lastName: data['lastName'],
      displayName,
      bday,
      photoBase64,
      channels,
      employment,
      relatedNames,
    };
  }

  // organization
  const orgName = data['name'] ?? key;
  if (scope.workRels) {
    for (const w of input.workrels) {
      const name = `${w['subjectName2'] ?? ''} ${w['subjectName1'] ?? ''}`.trim();
      if (!name) continue;
      relatedNames.push({ name, label: w['label'] || 'Contact' });
    }
  }
  return { kind, uid, displayName: orgName, orgName, photoBase64, channels, relatedNames };
}
