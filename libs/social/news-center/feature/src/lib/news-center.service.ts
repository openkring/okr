import { inject, Injectable } from '@angular/core';

import { NEWS_SEGMENTS, NewsChannelModel, NewsChannelRequestModel, NewsSegment, NewsSubscriptionModel } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { NewsChannelRequestService, NewsChannelService, NewsRelayService, NewsSubscriptionService } from '@okr/social-news-center-data-access';
import type { NewsResolveError } from '@okr/social-news-center-ui';
import { NewsItem, NewsRequestFormData, parseNewsFeed, resetSegment, webcamItem } from '@okr/social-news-center-util';

/** What the page knows about one channel's feed. */
export interface NewsFeedState {
  items: NewsItem[];
  loading: boolean;
  error: boolean;
  /** ms since epoch of the last finished load; 0 = never loaded. */
  fetchedAt: number;
}

/** Design §8: a feed is fetched again when it is older than this and its segment is shown again. */
export const NEWS_REFETCH_MS = 10 * 60_000;
export const NEWS_FETCH_CONCURRENCY = 4;
export const NEWS_MAX_PER_CHANNEL = 20;
export const NEWS_MAX_ALL = 60;
const DEFAULT_REFRESH_MINUTES = 5;
const RESOLVE_REASONS: NewsResolveError[] = ['no-feed', 'segment', 'url', 'blocked', 'http-not-image'];

/** How old a channel's data may get: a webcam per its `refreshMinutes`, every other feed 10 minutes. */
function maxAgeMs(channel: NewsChannelModel): number {
  if (channel.kind !== 'image') return NEWS_REFETCH_MS;
  // undefined on legacy docs (Firestore reads skip model defaults)
  return Math.max(1, channel.refreshMinutes || DEFAULT_REFRESH_MINUTES) * 60_000;
}

/** The channels whose data is missing or too old. A channel that is loading right now is never returned. */
export function staleChannels(channels: NewsChannelModel[], feeds: Record<string, NewsFeedState>, nowMs: number, force = false): NewsChannelModel[] {
  return channels.filter((c) => {
    const feed = feeds[c.okey];
    if (feed?.loading) return false;
    if (force || !feed) return true;
    return nowMs - feed.fetchedAt >= maxAgeMs(c);
  });
}

/** The relay's HttpsError (`details.reason`) as the settings modal's error code. */
export function toResolveError(error: unknown): NewsResolveError {
  const e = error as { code?: string; details?: { reason?: string } } | undefined;
  const reason = e?.details?.reason as NewsResolveError | undefined;
  if (reason && RESOLVE_REASONS.includes(reason)) return reason;
  if (typeof e?.code === 'string' && e.code.endsWith('permission-denied')) return 'permission-denied';
  return 'unknown';
}

/** A segment from the url or a form; anything unknown is the video segment. */
export function toNewsSegment(value: string | undefined | null): NewsSegment {
  return NEWS_SEGMENTS.includes(value as NewsSegment) ? (value as NewsSegment) : 'video';
}

/** A fresh subscription doc for a user who never changed anything (doc id = Auth uid). */
export function emptySubscription(uid: string, tenantId: string): NewsSubscriptionModel {
  const sub = new NewsSubscriptionModel();
  sub.okey = uid;
  sub.tenants = [tenantId];
  return sub;
}

/**
 * The NewsCenter work that does not need the UI: loading feeds through the relay and changing
 * the user's subscription and the club list. The store owns the state; this service owns the I/O.
 */
@Injectable({ providedIn: 'root' })
export class NewsCenterService {
  private readonly relay = inject(NewsRelayService);
  private readonly subscriptionService = inject(NewsSubscriptionService);
  private readonly channelService = inject(NewsChannelService);
  private readonly requestService = inject(NewsChannelRequestService);

  /*-------------------------- feeds --------------------------------*/

  /**
   * One channel's items. Webcams are not fetched as feeds: a direct camera gets a cache-busted url,
   * a `viaRelay` camera its image as a data URL from the relay. Any failure marks only this channel.
   */
  public async loadChannel(channel: NewsChannelModel, nowMs: number): Promise<NewsFeedState> {
    try {
      let items: NewsItem[];
      if (channel.kind === 'image') {
        const item = webcamItem(channel, nowMs);
        if (channel.viaRelay) {
          const dataUrl = await this.relay.fetchImage(channel.okey);
          item.mediaUrl = dataUrl;
          item.thumbnailUrl = dataUrl;
        }
        items = [item];
      } else {
        const { body } = await this.relay.fetchFeed(channel.okey);
        items = parseNewsFeed(body, channel.kind, channel.okey, NEWS_MAX_PER_CHANNEL);
      }
      return { items, loading: false, error: false, fetchedAt: nowMs };
    } catch (error) {
      console.warn(`NewsCenterService.loadChannel(${channel.okey}): ${(error as Error)?.message ?? error}`);
      return { items: [], loading: false, error: true, fetchedAt: nowMs };
    }
  }

  /** Loads the channels with at most `concurrency` requests in flight; reports each result as soon as it is there. */
  public async loadChannels(
    channels: NewsChannelModel[],
    onLoaded: (channelKey: string, state: NewsFeedState) => void,
    concurrency = NEWS_FETCH_CONCURRENCY,
    now: () => number = Date.now
  ): Promise<void> {
    const queue = [...channels];
    const worker = async (): Promise<void> => {
      for (let channel = queue.shift(); channel; channel = queue.shift()) {
        onLoaded(channel.okey, await this.loadChannel(channel, now()));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  }

  /*-------------------------- subscription --------------------------------*/

  /** «Entfernen»: a default channel goes on the hidden list, an added one comes off the added list. */
  public hide(sub: NewsSubscriptionModel, channel: NewsChannelModel): Promise<NewsSubscriptionModel> {
    return this.save(channel.defaultOn
      ? { ...sub, hiddenChannelKeys: addKey(sub.hiddenChannelKeys, channel.okey) }
      : { ...sub, addedChannelKeys: removeKey(sub.addedChannelKeys, channel.okey) });
  }

  /** «wieder einblenden» for a hidden default channel. */
  public show(sub: NewsSubscriptionModel, channelKey: string): Promise<NewsSubscriptionModel> {
    return this.save({ ...sub, hiddenChannelKeys: removeKey(sub.hiddenChannelKeys, channelKey) });
  }

  /** «Kanal hinzufügen» for an offered channel. */
  public add(sub: NewsSubscriptionModel, channelKey: string): Promise<NewsSubscriptionModel> {
    return this.save({ ...sub, addedChannelKeys: addKey(sub.addedChannelKeys, channelKey) });
  }

  /** «Standard wiederherstellen» for one segment. */
  public reset(sub: NewsSubscriptionModel, channels: NewsChannelModel[], segment: NewsSegment): Promise<NewsSubscriptionModel> {
    return this.save(resetSegment(sub, channels, segment));
  }

  private async save(sub: NewsSubscriptionModel): Promise<NewsSubscriptionModel> {
    await this.subscriptionService.save(sub);
    return sub;
  }

  /*-------------------------- suggestions --------------------------------*/

  public suggest(data: NewsRequestFormData, requester: { uid: string; name: string; tenantId: string }): Promise<string | undefined> {
    const req = new NewsChannelRequestModel();
    req.tenants = [requester.tenantId];
    req.segment = toNewsSegment(data.segment);
    req.url = data.url;
    req.note = data.note;
    req.requesterUid = requester.uid;
    req.requesterName = requester.name;
    req.status = 'open';
    req.createdAt = getTodayStr(DateFormat.StoreDateTime);
    req.decidedAt = '';
    req.channelKey = '';
    return this.requestService.create(req);
  }

  public reject(req: NewsChannelRequestModel): Promise<void> {
    return this.requestService.decide(req, 'rejected');
  }

  /**
   * «Übernehmen» of a suggestion: the request is marked accepted with the new channel's key only
   * after the channel was saved. A failed save (no key) leaves the suggestion open.
   */
  public async acceptAfterSave(req: NewsChannelRequestModel, channelSave: Promise<string | undefined>): Promise<boolean> {
    const channelKey = await channelSave.catch(() => undefined);
    if (!channelKey) return false;
    await this.requestService.decide(req, 'accepted', channelKey);
    return true;
  }

  /*-------------------------- club list --------------------------------*/

  /** A new channel goes to the end of its segment; an existing one is updated. Resolves to the channel key, undefined on failure. */
  public saveChannel(channel: NewsChannelModel, tenantId: string, all: NewsChannelModel[]): Promise<string | undefined> {
    if (channel.okey) return this.channelService.update(channel);
    const inSegment = all.filter((c) => c.segment === channel.segment);
    const order = inSegment.reduce((max, c) => Math.max(max, c.order ?? 0), -1) + 1;
    return this.channelService.create({ ...channel, tenants: [tenantId], order });
  }

  public archiveChannel(channel: NewsChannelModel): Promise<void> {
    return this.channelService.archive(channel);
  }

  /** Writes `order` = position for every channel whose position changed. */
  public async reorder(channels: NewsChannelModel[], orderedKeys: string[]): Promise<void> {
    const byKey = new Map(channels.map((c) => [c.okey, c]));
    for (const [index, key] of orderedKeys.entries()) {
      const channel = byKey.get(key);
      if (channel && channel.order !== index) await this.channelService.update({ ...channel, order: index });
    }
  }
}

function addKey(keys: string[] | undefined, key: string): string[] {
  const list = keys ?? [];
  return list.includes(key) ? list : [...list, key];
}

function removeKey(keys: string[] | undefined, key: string): string[] {
  return (keys ?? []).filter((k) => k !== key);
}
