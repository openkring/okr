import { describe, expect, it } from 'vitest';
import { AddressDirectoryModel, DirectoryEntry, NewsChannelModel } from '@okr/shared-models';
import { avatarOf, isPlaced, orgPostalString } from './news-channel-place.util';

function entry(patch: Partial<DirectoryEntry>): DirectoryEntry {
  return {
    addressOkey: 'a', addressChannel: 'postal', addressChannelLabel: '', addressUsage: '', addressUsageLabel: '',
    isFavorite: false, isCc: false, email: '', phone: '', streetName: '', streetNumber: '', addressValue2: '',
    zipCode: '', city: '', countryCode: '', url: '', ...patch,
  };
}
const dir = (entries: DirectoryEntry[]): AddressDirectoryModel => ({ entries } as AddressDirectoryModel);

describe('isPlaced', () => {
  it('is true for real coordinates', () => {
    expect(isPlaced({ latitude: 47.3, longitude: 8.5 })).toBe(true);
  });
  it('treats 0/0 as not placed', () => {
    expect(isPlaced({ latitude: 0, longitude: 0 })).toBe(false);
  });
  it('treats missing or non-finite values as not placed', () => {
    expect(isPlaced({} as Pick<NewsChannelModel, 'latitude' | 'longitude'>)).toBe(false);
    expect(isPlaced({ latitude: NaN, longitude: 8 })).toBe(false);
    expect(isPlaced({ latitude: 47, longitude: Infinity })).toBe(false);
  });
});

describe('orgPostalString', () => {
  it('prefers the favorite postal entry', () => {
    const d = dir([
      entry({ streetName: 'Alte Gasse', streetNumber: '2', zipCode: '8000', city: 'Zürich', countryCode: 'CH' }),
      entry({ isFavorite: true, streetName: 'Seestrasse', streetNumber: '1', zipCode: '8712', city: 'Stäfa', countryCode: 'CH' }),
    ]);
    expect(orgPostalString(d)).toBe('Seestrasse 1, 8712 Stäfa, CH');
  });
  it('falls back to the first postal entry', () => {
    const d = dir([
      entry({ addressChannel: 'email', isFavorite: true, email: 'x@y.ch' }),
      entry({ streetName: 'Hafen', zipCode: '4500', city: 'Solothurn' }),
    ]);
    expect(orgPostalString(d)).toBe('Hafen, 4500 Solothurn');
  });
  it('drops empty parts', () => {
    expect(orgPostalString(dir([entry({ zipCode: '8712', city: 'Stäfa', countryCode: 'CH' })]))).toBe('8712 Stäfa, CH');
  });
  it("returns '' without a postal entry", () => {
    expect(orgPostalString(undefined)).toBe('');
    expect(orgPostalString(dir([entry({ addressChannel: 'email', email: 'a@b.ch' }), entry({ addressChannel: 'phone', phone: '1' })]))).toBe('');
    expect(orgPostalString({} as AddressDirectoryModel)).toBe('');
  });
  it("returns '' for a postal entry without any address part", () => {
    expect(orgPostalString(dir([entry({ isFavorite: true })]))).toBe('');
  });
});

describe('avatarOf', () => {
  const ch = (patch: Partial<NewsChannelModel>): NewsChannelModel => ({ okey: 'c1', segment: 'webcam', avatarUrl: '', ...patch } as NewsChannelModel);
  const feed = (thumbnailUrl: string | undefined, error = false) => ({ items: [{ thumbnailUrl }], error });

  it('prefers an explicit avatarUrl', () => {
    expect(avatarOf(ch({ avatarUrl: 'https://x.org/a.png' }), feed('https://cam/1.jpg'))).toBe('https://x.org/a.png');
  });
  it('uses the current still of a webcam without avatarUrl', () => {
    expect(avatarOf(ch({}), feed('https://cam/1.jpg?t=5'))).toBe('https://cam/1.jpg?t=5');
  });
  it('ignores a channel whose feed has error', () => {
    expect(avatarOf(ch({}), feed('https://cam/1.jpg', true))).toBe('');
  });
  it("is '' for a webcam that is not loaded yet", () => {
    expect(avatarOf(ch({}), undefined)).toBe('');
    expect(avatarOf(ch({}), { items: [], error: false })).toBe('');
  });
  it('never takes a thumbnail for a non-webcam channel', () => {
    expect(avatarOf(ch({ segment: 'audio' }), feed('https://cdn/ep.jpg'))).toBe('');
  });
});
