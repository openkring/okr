import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TENANTS } from '@okr/shared-constants';
import { NamedModel, OkrModel } from './base.model';

/** The four tabs of the NewsCenter page. */
export type NewsSegment = 'video' | 'audio' | 'text' | 'webcam';
export const NEWS_SEGMENTS: NewsSegment[] = ['video', 'audio', 'text', 'webcam'];

/** How a channel's `feedUrl` is read: a video platform feed, a podcast/RSS feed, or a refreshing still image (webcam). */
export type NewsChannelKind = 'youtube' | 'vimeo' | 'podcast' | 'rss' | 'image';

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
