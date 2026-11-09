import { AddressDirectoryModel, DirectoryEntry, NewsChannelModel } from '@okr/shared-models';

/** A webcam has a position: both coordinates finite and not the `0/0` "not placed" marker (legacy docs lack them). */
export function isPlaced(channel: Pick<NewsChannelModel, 'latitude' | 'longitude'>): boolean {
  const { latitude, longitude } = channel;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude !== 0 || longitude !== 0;
}

/**
 * The org's postal address from its `address-directory` doc as one geocodable line: the favorite postal
 * entry, else the first postal one. Empty parts are dropped; '' when there is no usable postal entry.
 */
export function orgPostalString(directory: AddressDirectoryModel | undefined): string {
  const postal = (directory?.entries ?? []).filter((e) => e.addressChannel === 'postal');
  const chosen = postal.find((e) => e.isFavorite) ?? postal[0];
  return chosen ? postalLine(chosen) : '';
}

function postalLine(e: DirectoryEntry): string {
  const join = (sep: string, ...parts: (string | undefined)[]): string => parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);
  return join(', ', join(' ', e.streetName, e.streetNumber), join(' ', e.zipCode, e.city), e.countryCode);
}

/** What `avatarOf` needs from a channel's feed state (the store's `NewsFeedState`). */
export interface NewsAvatarFeed {
  items: { thumbnailUrl?: string }[];
  error: boolean;
}

/**
 * The avatar of a channel: its explicit `avatarUrl`; else, for a webcam, the current still (a cache-busted
 * URL or the relay's data URL); else '' — the caller shows the initial letter.
 */
export function avatarOf(channel: Pick<NewsChannelModel, 'avatarUrl' | 'segment'>, feed: NewsAvatarFeed | undefined): string {
  if (channel.avatarUrl) return channel.avatarUrl;
  if (channel.segment !== 'webcam' || !feed || feed.error) return '';
  return feed.items[0]?.thumbnailUrl ?? '';
}
