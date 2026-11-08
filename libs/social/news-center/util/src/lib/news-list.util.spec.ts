import { describe, expect, it } from 'vitest';
import { NewsChannelModel, NewsSegment, NewsSubscriptionModel } from '@okr/shared-models';
import { NewsItem } from './news-item';
import { canSuggest, effectiveChannels, hiddenChannels, mergeNewest, optionalChannels, resetSegment } from './news-list.util';

const ch = (okey: string, o: Partial<NewsChannelModel> = {}): NewsChannelModel => Object.assign(new NewsChannelModel(), { okey, segment: 'video' as NewsSegment, ...o });
const channels = [
  ch('a', { defaultOn: true, order: 2 }),
  ch('b', { defaultOn: true, order: 1 }),
  ch('c', { defaultOn: false, order: 3 }),
  ch('d', { defaultOn: true, isArchived: true, order: 0 }),
  ch('e', { defaultOn: true, segment: 'audio', order: 0 }),
  ch('f', { defaultOn: false, segment: 'audio', order: 1 }),
];
const sub = (hidden: string[], added: string[]): NewsSubscriptionModel => Object.assign(new NewsSubscriptionModel(), { hiddenChannelKeys: hidden, addedChannelKeys: added });

describe('effectiveChannels', () => {
  it('= defaultOn − hidden ∪ added, by order, archived dropped, stale keys ignored', () => {
    expect(effectiveChannels(channels, sub(['a', 'gone'], ['c', 'deleted']), 'video').map((c) => c.okey)).toEqual(['b', 'c']);
  });
  it('no subscription doc = club defaults', () => {
    expect(effectiveChannels(channels, undefined, 'video').map((c) => c.okey)).toEqual(['b', 'a']);
  });
  it('only the asked segment', () => {
    expect(effectiveChannels(channels, undefined, 'audio').map((c) => c.okey)).toEqual(['e']);
  });
  it('an added archived channel stays dropped', () => {
    expect(effectiveChannels(channels, sub([], ['d']), 'video').map((c) => c.okey)).toEqual(['b', 'a']);
  });
});

describe('optionalChannels / hiddenChannels', () => {
  it('optional = not defaultOn and not added', () => {
    expect(optionalChannels(channels, undefined, 'video').map((c) => c.okey)).toEqual(['c']);
    expect(optionalChannels(channels, sub([], ['c']), 'video')).toEqual([]);
  });
  it('hidden = defaultOn channels the user switched off', () => {
    expect(hiddenChannels(channels, sub(['a', 'gone'], []), 'video').map((c) => c.okey)).toEqual(['a']);
    expect(hiddenChannels(channels, undefined, 'video')).toEqual([]);
  });
});

describe('resetSegment', () => {
  it("removes only that segment's keys", () => {
    const s = sub(['a', 'e', 'gone'], ['c', 'f']);
    const r = resetSegment(s, channels, 'video');
    expect(r.hiddenChannelKeys).toEqual(['e', 'gone']);
    expect(r.addedChannelKeys).toEqual(['f']);
    expect(s.hiddenChannelKeys).toEqual(['a', 'e', 'gone']);
  });
});

describe('mergeNewest', () => {
  const it_ = (id: string, publishedAt: string): NewsItem => ({ id, channelKey: 'x', title: id, publishedAt });
  it('sorts desc, undated last, stable', () => {
    const r = mergeNewest([[it_('u1', ''), it_('old', '2026-01-01T00:00:00.000Z')], [it_('new', '2026-03-01T00:00:00.000Z'), it_('u2', '')]]);
    expect(r.map((i) => i.id)).toEqual(['new', 'old', 'u1', 'u2']);
  });
  it('caps at 60 by default', () => {
    const many = Array.from({ length: 100 }, (_, i) => it_('i' + i, new Date(2026, 0, 1, 0, i).toISOString()));
    expect(mergeNewest([many])).toHaveLength(60);
    expect(mergeNewest([many], 5)).toHaveLength(5);
  });
});

describe('canSuggest', () => {
  it('is false at 5 open', () => {
    expect(canSuggest(4)).toBe(true);
    expect(canSuggest(5)).toBe(false);
  });
});
