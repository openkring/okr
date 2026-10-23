import type { LearningConfig, Roles } from '@okr/shared-models';
import {
  canChangeTags, canDeleteItem, canEditItem, canUploadTo, curatedTopics, type LearningActor,
} from './learning-rights';

const config: LearningConfig = {
  folder: 'f1', topics: 'knoten, wetter, recht', defaultTab: 'videos',
  curators: [{ tag: 'knoten', personKeys: ['p1'] }, { tag: 'wetter', personKeys: ['p1', 'p2'] }],
};
const actor = (personKey: string, roles: Roles = {}, isGroupAdmin = false): LearningActor => ({ personKey, roles, isGroupAdmin });
const curator = actor('p1');
const member = actor('p9');

describe('curatedTopics', () => {
  it('all for contentAdmin, admin and group admin', () => {
    expect(curatedTopics(config, actor('x', { contentAdmin: true }))).toBe('all');
    expect(curatedTopics(config, actor('x', { admin: true }))).toBe('all');
    expect(curatedTopics(config, actor('x', {}, true))).toBe('all');
  });
  it('lists a curator topics', () => {
    expect(curatedTopics(config, curator)).toEqual(['knoten', 'wetter']);
    expect(curatedTopics(config, actor('p2'))).toEqual(['wetter']);
  });
  it('empty for a plain member', () => {
    expect(curatedTopics(config, member)).toEqual([]);
  });
});

describe('canEditItem', () => {
  it('curator edits an item with a curated topic, even if shared', () => {
    expect(canEditItem(config, curator, 'knoten, recht')).toBe(true);
  });
  it('curator cannot edit an item without a curated topic', () => {
    expect(canEditItem(config, curator, 'recht')).toBe(false);
    expect(canEditItem(config, curator, 'unrelated')).toBe(false);
  });
  it('member cannot edit, admin can', () => {
    expect(canEditItem(config, member, 'knoten')).toBe(false);
    expect(canEditItem(config, actor('x', { admin: true }), 'recht')).toBe(true);
  });
});

describe('canChangeTags', () => {
  it('curator may add or remove a curated topic', () => {
    expect(canChangeTags(config, curator, 'knoten', 'knoten, wetter')).toBe(true);
    expect(canChangeTags(config, curator, 'knoten, wetter', 'knoten')).toBe(true);
  });
  it('curator cannot strip a foreign topic', () => {
    expect(canChangeTags(config, curator, 'knoten, recht', 'knoten')).toBe(false);
  });
  it('curator cannot add a foreign topic', () => {
    expect(canChangeTags(config, curator, 'knoten', 'knoten, recht')).toBe(false);
  });
  it('non-room tags are free to change', () => {
    expect(canChangeTags(config, curator, 'knoten', 'knoten, misc')).toBe(true);
  });
  it('member cannot change room topics; admin can', () => {
    expect(canChangeTags(config, member, 'knoten', 'wetter')).toBe(false);
    expect(canChangeTags(config, actor('x', { contentAdmin: true }), 'knoten', 'recht')).toBe(true);
  });
});

describe('canDeleteItem', () => {
  it('curator deletes only when every room topic is curated', () => {
    expect(canDeleteItem(config, curator, 'knoten, wetter')).toBe(true);
    expect(canDeleteItem(config, curator, 'knoten, recht')).toBe(false);
  });
  it('curator cannot delete a shared doc of another curator topic set', () => {
    expect(canDeleteItem(config, actor('p2'), 'knoten, wetter')).toBe(false);
  });
  it('a doc without room topic: only its uploader', () => {
    expect(canDeleteItem(config, member, 'misc', 'p9')).toBe(true);
    expect(canDeleteItem(config, member, 'misc', 'other')).toBe(false);
    expect(canDeleteItem(config, member, 'misc')).toBe(false);
  });
  it('admin always', () => {
    expect(canDeleteItem(config, actor('x', {}, true), 'recht')).toBe(true);
  });
});

describe('canUploadTo', () => {
  it('curator uploads to curated topics only', () => {
    expect(canUploadTo(config, curator, 'knoten')).toBe(true);
    expect(canUploadTo(config, curator, 'recht')).toBe(false);
  });
  it('member cannot upload, admin can', () => {
    expect(canUploadTo(config, member, 'knoten')).toBe(false);
    expect(canUploadTo(config, actor('x', { admin: true }), 'recht')).toBe(true);
  });
});
