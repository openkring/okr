import { describe, expect, it } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';

import { customLocationAvatar } from './diary-avatar.util';
import {
  DIARY_TEXT_LOCATION_ICON, diaryListLocations, diaryLocationAvatarKey, diaryLocationIcon, diaryLocationLabel,
} from './diary-location-avatar.util';

const keyed = (key: string, name: string): AvatarInfo =>
  ({ key, name1: name, name2: '', label: name, modelType: 'location', type: '', subType: '' });

describe('diary-location-avatar.util', () => {
  it('a free-text location falls back to the location icon', () => {
    expect(DIARY_TEXT_LOCATION_ICON).toBe('location');
    expect(diaryLocationIcon(customLocationAvatar('Stäfa ZH'))).toBe('location');
  });
  it('a linked location keeps the avatar default icon', () => {
    expect(diaryLocationIcon(keyed('l1', 'Stäfa ZH'))).toBeUndefined();
  });
  it('the avatar key of a linked location is location.<okey>', () => {
    expect(diaryLocationAvatarKey(keyed('l1', 'Stäfa ZH'))).toBe('location.l1');
  });
  it('a free-text location has no avatar key, so the icon is shown', () => {
    expect(diaryLocationAvatarKey(customLocationAvatar('Stäfa ZH'))).toBe('');
  });
  it('the label is the name as stored, canton included', () => {
    expect(diaryLocationLabel(keyed('l1', 'Stäfa ZH'))).toBe('Stäfa ZH');
    expect(diaryLocationLabel(customLocationAvatar('  Männedorf   ZH '))).toBe('Männedorf ZH');
  });
  it('the list shows the locations in order, main location first', () => {
    const d = { locations: [keyed('a', 'Stäfa'), customLocationAvatar('Männedorf'), keyed('c', 'Meilen')] };
    expect(diaryListLocations(d).map(diaryLocationLabel)).toEqual(['Stäfa', 'Männedorf', 'Meilen']);
  });
  it('the list caps the locations at max', () => {
    const d = { locations: [keyed('a', 'A'), keyed('b', 'B'), keyed('c', 'C'), keyed('d', 'D')] };
    expect(diaryListLocations(d).map(l => l.key)).toEqual(['a', 'b', 'c']);
    expect(diaryListLocations(d, 1).map(l => l.key)).toEqual(['a']);
  });
  it('an entry without locations shows none', () => {
    expect(diaryListLocations({ locations: [] })).toEqual([]);
    expect(diaryListLocations({} as { locations: AvatarInfo[] })).toEqual([]);
  });
});
