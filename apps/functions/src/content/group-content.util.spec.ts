import { describe, expect, it } from 'vitest';

import { groupAdminDeleteRefusal, isLearningRoomFolder } from './group-content.util';

describe('learning room refusal for group admins', () => {
  it('detects the flag only when strictly true', () => {
    expect(isLearningRoomFolder({ learningRoom: true })).toBe(true);
    expect(isLearningRoomFolder({ learningRoom: false })).toBe(false);
    expect(isLearningRoomFolder({})).toBe(false);
    expect(isLearningRoomFolder(undefined)).toBe(false);
  });

  it('refuses a document in a room folder', () => {
    expect(groupAdminDeleteRefusal('document', {}, { learningRoom: true })).toBeTruthy();
  });

  it('allows a document in a normal or missing folder', () => {
    expect(groupAdminDeleteRefusal('document', {}, { name: 'x' })).toBeUndefined();
    expect(groupAdminDeleteRefusal('document', {}, undefined)).toBeUndefined();
  });

  it('refuses a flagged folder but not a plain one', () => {
    expect(groupAdminDeleteRefusal('folder', { learningRoom: true }, undefined)).toBeTruthy();
    expect(groupAdminDeleteRefusal('folder', {}, undefined)).toBeUndefined();
  });

  it('does not look at the folder flag for a folder target', () => {
    expect(groupAdminDeleteRefusal('folder', {}, { learningRoom: true })).toBeUndefined();
  });
});
