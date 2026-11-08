import { NewsChannelModel, NewsSegment, NewsSubscriptionModel } from '@okr/shared-models';
import { NewsItem } from './news-item';

const inSegment = (channels: NewsChannelModel[], segment: NewsSegment): NewsChannelModel[] => channels.filter((c) => c.segment === segment && !c.isArchived);
const byOrder = (a: NewsChannelModel, b: NewsChannelModel): number => a.order - b.order;

/** The channels a user sees in a segment: club defaults, minus what they hid, plus what they added. Stale keys are ignored. */
export function effectiveChannels(channels: NewsChannelModel[], sub: NewsSubscriptionModel | undefined, segment: NewsSegment): NewsChannelModel[] {
  const hidden = new Set(sub?.hiddenChannelKeys ?? []);
  const added = new Set(sub?.addedChannelKeys ?? []);
  return inSegment(channels, segment)
    .filter((c) => (c.defaultOn ? !hidden.has(c.okey) : added.has(c.okey)))
    .sort(byOrder);
}

/** Channels the club offers but does not switch on by itself, and the user has not added yet. */
export function optionalChannels(channels: NewsChannelModel[], sub: NewsSubscriptionModel | undefined, segment: NewsSegment): NewsChannelModel[] {
  const added = new Set(sub?.addedChannelKeys ?? []);
  return inSegment(channels, segment)
    .filter((c) => !c.defaultOn && !added.has(c.okey))
    .sort(byOrder);
}

/** Default channels the user switched off. */
export function hiddenChannels(channels: NewsChannelModel[], sub: NewsSubscriptionModel | undefined, segment: NewsSegment): NewsChannelModel[] {
  const hidden = new Set(sub?.hiddenChannelKeys ?? []);
  return inSegment(channels, segment)
    .filter((c) => c.defaultOn && hidden.has(c.okey))
    .sort(byOrder);
}

/** Back to the club defaults for one segment; the other segments' choices stay. Returns a copy. */
export function resetSegment(sub: NewsSubscriptionModel, channels: NewsChannelModel[], segment: NewsSegment): NewsSubscriptionModel {
  const keys = new Set(channels.filter((c) => c.segment === segment).map((c) => c.okey));
  return {
    ...sub,
    hiddenChannelKeys: sub.hiddenChannelKeys.filter((k) => !keys.has(k)),
    addedChannelKeys: sub.addedChannelKeys.filter((k) => !keys.has(k)),
  };
}

/** Newest first across channels; items without a date come last; the sort is stable. */
export function mergeNewest(lists: NewsItem[][], max = 60): NewsItem[] {
  return lists
    .flat()
    .sort((a, b) => (a.publishedAt === b.publishedAt ? 0 : !a.publishedAt ? 1 : !b.publishedAt ? -1 : a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, max);
}

const MAX_OPEN_REQUESTS = 5;

/** A user may have a few channel suggestions waiting at once, not more. */
export function canSuggest(openCount: number): boolean {
  return openCount < MAX_OPEN_REQUESTS;
}
