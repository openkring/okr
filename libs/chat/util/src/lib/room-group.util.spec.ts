import { describe, expect, it } from 'vitest';
import { GroupModel } from '@okr/shared-models';
import { groupKeyForRoom } from './room-group.util';

const group = (okey: string, matrixRoomId: string, isArchived = false): GroupModel => {
  const g = new GroupModel('scs');
  g.okey = okey;
  g.matrixRoomId = matrixRoomId;
  g.isArchived = isArchived;
  return g;
};

describe('groupKeyForRoom', () => {
  it('returns the key of the group whose matrixRoomId is the room', () => {
    const groups = [group('vorstand', '!a:bkchat.etke.host'), group('masters', '!b:bkchat.etke.host')];
    expect(groupKeyForRoom('!b:bkchat.etke.host', groups)).toBe('masters');
  });

  it('returns undefined when no group owns the room', () => {
    expect(groupKeyForRoom('!x:bkchat.etke.host', [group('vorstand', '!a:bkchat.etke.host')])).toBeUndefined();
  });

  it('ignores an archived group that still names the room', () => {
    const groups = [group('alt', '!a:bkchat.etke.host', true)];
    expect(groupKeyForRoom('!a:bkchat.etke.host', groups)).toBeUndefined();
  });

  it('picks the live group when an archived one names the same room', () => {
    const groups = [group('alt', '!a:bkchat.etke.host', true), group('neu', '!a:bkchat.etke.host')];
    expect(groupKeyForRoom('!a:bkchat.etke.host', groups)).toBe('neu');
  });

  it('never matches an empty room id against groups without a room', () => {
    expect(groupKeyForRoom('', [group('ohne', '')])).toBeUndefined();
  });
});
