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

  /**
   * Loads the channels through the shared `queue` (at most 4 relay calls in flight for the whole
   * page) and reports each result as soon as it is there. A channel that is no longer `wanted`
   * when its turn comes (its segment was left) is not fetched; `onSkipped` reports it instead.
   */
  public async loadChannels(
    channels: NewsChannelModel[],
    queue: NewsFetchQueue,
    handlers: { onLoaded: (channelKey: string, state: NewsFeedState) => void; onSkipped?: (channelKey: string) => void },
    wanted: (channel: NewsChannelModel) => boolean = () => true,
    now: () => number = Date.now
  ): Promise<void> {
    await Promise.all(channels.map((channel) => queue.enqueue({
      wanted: () => wanted(channel),
      run: async () => handlers.onLoaded(channel.okey, await this.loadChannel(channel, now())),
      skip: () => handlers.onSkipped?.(channel.okey),
    })));
  }

  /*-------------------------- subscription --------------------------------*/

  /** A per-page writer for the user's subscription doc; `onLocalChange` receives the optimistic doc (undefined = back to the server's). */
  public subscriptionWriter(onLocalChange: (sub: NewsSubscriptionModel | undefined) => void): NewsSubscriptionWriter {
    return new NewsSubscriptionWriter((sub) => this.subscriptionService.save(sub), onLocalChange);
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

/** One unit of work for `NewsFetchQueue`. */
export interface NewsFetchTask {
  /** checked when the task would start; false drops it without running */
  wanted: () => boolean;
  run: () => Promise<void>;
  skip: () => void;
}

/**
 * The page-wide limit on relay calls: at most `max` tasks run at once, however many refreshes
 * queued them. Tasks that are no longer wanted are dropped instead of started (`prune` drops them
 * at once, e.g. on a segment switch).
 */
export class NewsFetchQueue {
  private readonly waiting: { task: NewsFetchTask; done: () => void }[] = [];
  private active = 0;

  constructor(private readonly max = NEWS_FETCH_CONCURRENCY) {}

  /** Resolves when the task has run or was dropped; never rejects. */
  public enqueue(task: NewsFetchTask): Promise<void> {
    return new Promise<void>((done) => {
      this.waiting.push({ task, done });
      this.pump();
    });
  }

  /** Drops every waiting task that is no longer wanted. */
  public prune(): void {
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const entry = this.waiting[i];
      if (!entry.task.wanted()) {
        this.waiting.splice(i, 1);
        this.drop(entry);
      }
    }
  }

  private pump(): void {
    while (this.active < this.max && this.waiting.length > 0) {
      const entry = this.waiting.shift();
      if (!entry) return;
      if (!entry.task.wanted()) {
        this.drop(entry);
        continue;
      }
      this.active++;
      entry.task.run()
        .catch((error) => console.warn('NewsFetchQueue:', error))
        .finally(() => {
          this.active--;
          entry.done();
          this.pump();
        });
    }
  }

  private drop(entry: { task: NewsFetchTask; done: () => void }): void {
    entry.task.skip();
    entry.done();
  }
}

/**
 * Saves the user's subscription without losing quick taps. Each change is applied at once to a
 * local copy (built on the previous change, not on the last server snapshot) and the writes run
 * one after another. When the last write has finished, the local copy is dropped and the server's
 * doc (which then carries every change) takes over again — also after a failed write.
 */
export class NewsSubscriptionWriter {
  private local: NewsSubscriptionModel | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(
    private readonly persist: (sub: NewsSubscriptionModel) => Promise<void>,
    private readonly onLocalChange: (sub: NewsSubscriptionModel | undefined) => void
  ) {}

  /** «Entfernen»: a default channel goes on the hidden list, an added one comes off the added list. */
  public hide(base: NewsSubscriptionModel, channel: NewsChannelModel): Promise<NewsSubscriptionModel> {
    return this.apply(base, (sub) => (channel.defaultOn
      ? { ...sub, hiddenChannelKeys: addKey(sub.hiddenChannelKeys, channel.okey) }
      : { ...sub, addedChannelKeys: removeKey(sub.addedChannelKeys, channel.okey) }));
  }

  /** «wieder einblenden» for a hidden default channel. */
  public show(base: NewsSubscriptionModel, channelKey: string): Promise<NewsSubscriptionModel> {
    return this.apply(base, (sub) => ({ ...sub, hiddenChannelKeys: removeKey(sub.hiddenChannelKeys, channelKey) }));
  }

  /** «Kanal hinzufügen» for an offered channel. */
  public add(base: NewsSubscriptionModel, channelKey: string): Promise<NewsSubscriptionModel> {
    return this.apply(base, (sub) => ({ ...sub, addedChannelKeys: addKey(sub.addedChannelKeys, channelKey) }));
  }

  /** «Standard wiederherstellen» for one segment. */
  public reset(base: NewsSubscriptionModel, channels: NewsChannelModel[], segment: NewsSegment): Promise<NewsSubscriptionModel> {
    return this.apply(base, (sub) => resetSegment(sub, channels, segment));
  }

  private apply(base: NewsSubscriptionModel, change: (sub: NewsSubscriptionModel) => NewsSubscriptionModel): Promise<NewsSubscriptionModel> {
    const next = change(this.local ?? base);
    this.local = next;
    this.pending++;
    this.onLocalChange(next);
    // the bookkeeping runs before the caller's await resumes, so a settled tap never sees a stale local copy
    const settled = this.chain.then(() => this.persist(next)).finally(() => {
      if (--this.pending === 0) {
        this.local = undefined;
        this.onLocalChange(undefined);
      }
    });
    this.chain = settled.catch(() => undefined);
    return settled.then(() => next);
  }
}

function addKey(keys: string[] | undefined, key: string): string[] {
  const list = keys ?? [];
  return list.includes(key) ? list : [...list, key];
}

function removeKey(keys: string[] | undefined, key: string): string[] {
  return (keys ?? []).filter((k) => k !== key);
}
