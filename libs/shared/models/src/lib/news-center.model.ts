import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TENANTS } from '@okr/shared-constants';
import { NamedModel, OkrModel } from './base.model';

/** The four tabs of the NewsCenter page. */
export type NewsSegment = 'video' | 'audio' | 'text' | 'webcam';
export const NEWS_SEGMENTS: NewsSegment[] = ['video', 'audio', 'text', 'webcam'];

/**
 * How a channel's `feedUrl` is read: a video platform feed, a podcast/RSS feed, a refreshing still image (webcam),
 * or an HTML news list without a feed that the relay turns into RSS using the channel's `scrape` selectors.
 */
export type NewsChannelKind = 'youtube' | 'vimeo' | 'podcast' | 'rss' | 'image' | 'html';

/**
 * CSS selectors for a `kind: 'html'` channel. `item` selects one element per news entry in the page at
 * `feedUrl`; the other selectors are evaluated inside each item. `link`/`image` read `href`/`src` from the
 * matched element (or the item itself when it is the link). `date` text is parsed as `dd.mm.yyyy` or ISO.
 */
export interface NewsScrapeConfig {
  item: string;
  link: string;
  title: string;
  date?: string;
  image?: string;
  description?: string;
}

/** Where a user's channel suggestion stands. */
export type NewsRequestStatus = 'open' | 'accepted' | 'rejected';

/**
 * `news-channels/{okey}` — one feed in the NewsCenter catalogue of a tenant (a YouTube channel,
 * a podcast, an RSS site, a webcam still image). `defaultOn` channels are shown to every user
 * until they hide them in their `NewsSubscriptionModel`.
 */
export class NewsChannelModel implements OkrModel, NamedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public segment: NewsSegment = 'video';
  public kind: NewsChannelKind = 'rss';
  public feedUrl = '';
  public siteUrl = '';
  public avatarUrl = '';
  public defaultOn = true;
  public order = 0;
  public refreshMinutes = 5;
  /** Webcams only: load the image through the relay op `newsImage` (design §7.1) instead of directly; required for http: image URLs. */
  public viaRelay = false;
  /**
   * Webcams with `viaRelay` only: `feedUrl` is an HTML page (e.g. a RediCam `snap.cgi`) whose first `<img>`
   * is the current still, because the camera stores each snapshot under a new name. The relay loads the page,
   * then that image (same host only). Legacy docs lack the field: read it as `false`.
   */
  public snapshotPage = false;
  /**
   * Webcams only: where the camera is (design 2026-11-09 webcam places). `0/0` = not placed; legacy docs
   * lack both fields — read them as not placed (`isPlaced`).
   */
  public latitude = 0;
  public longitude = 0;
  /** Webcams only: okey of the org that hosts the camera ('' = none). Linking an org fills the position once. */
  public orgKey = '';
  /** `kind: 'html'` only: how the relay finds the news entries in the page at `feedUrl` (design §7.2). */
  public scrape?: NewsScrapeConfig;
}

export const NewsChannelCollection = 'news-channels';
export const NewsChannelModelName = 'newsChannel';

/**
 * `news-subscriptions/{uid}` — a user's personal deviations from the channel defaults.
 * `okey` is the Firebase Auth uid.
 */
export class NewsSubscriptionModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  /** `defaultOn` channels the user switched off. */
  public hiddenChannelKeys: string[] = [];
  /** Non-default channels the user switched on. */
  public addedChannelKeys: string[] = [];
}

export const NewsSubscriptionCollection = 'news-subscriptions';
export const NewsSubscriptionModelName = 'newsSubscription';

/**
 * `news-channel-requests/{okey}` — a user's suggestion for a new channel, decided by an admin.
 * `createdAt` / `decidedAt` are `DateFormat.StoreDateTime` strings (via `convertDateFormatToString`).
 */
export class NewsChannelRequestModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public segment: NewsSegment = 'video';
  public url = '';
  public note = '';
  public requesterUid = '';
  public requesterName = '';
  public status: NewsRequestStatus = 'open';
  public createdAt = '';
  public decidedAt = '';
  /** The `news-channels` doc created when the request was accepted. */
  public channelKey = '';
}

export const NewsChannelRequestCollection = 'news-channel-requests';
export const NewsChannelRequestModelName = 'newsChannelRequest';
