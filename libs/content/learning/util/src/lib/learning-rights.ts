import type { LearningConfig, Roles } from '@okr/shared-models';

import { parseTopics } from './learning-classify';

export interface LearningActor {
  personKey: string;
  roles: Roles;
  /** admin of the group this room belongs to */
  isGroupAdmin: boolean;
}

function isAll(actor: LearningActor): boolean {
  return actor.roles?.contentAdmin === true || actor.roles?.admin === true || actor.isGroupAdmin;
}

/** The topics of the room (the config topics, in order). */
function roomTopics(config: LearningConfig, tags: string): string[] {
  const topics = parseTopics(config.topics);
  return parseTopics(tags).filter(t => topics.includes(t));
}

/** `'all'` for content admins, admins and the group admin; otherwise the topics the actor curates. */
export function curatedTopics(config: LearningConfig, actor: LearningActor): string[] | 'all' {
  if (isAll(actor)) return 'all';
  return (config.curators ?? [])
    .filter(c => (c.personKeys ?? []).includes(actor.personKey))
    .map(c => c.tag)
    .filter((t, i, a) => a.indexOf(t) === i);
}

export function canEditItem(config: LearningConfig, actor: LearningActor, docTags: string): boolean {
  const cur = curatedTopics(config, actor);
  if (cur === 'all') return true;
  return roomTopics(config, docTags).some(t => cur.includes(t));
}

/** A curator may only add or remove curated topics; topics outside the room are free. */
export function canChangeTags(config: LearningConfig, actor: LearningActor, oldTags: string, newTags: string): boolean {
  const cur = curatedTopics(config, actor);
  if (cur === 'all') return true;
  const before = roomTopics(config, oldTags);
  const after = roomTopics(config, newTags);
  const changed = [...before.filter(t => !after.includes(t)), ...after.filter(t => !before.includes(t))];
  return changed.every(t => cur.includes(t));
}

/**
 * A curator deletes only when every room topic of the doc is curated by them. A doc with no
 * room topic may be deleted by its uploader (`authorKey`).
 */
export function canDeleteItem(config: LearningConfig, actor: LearningActor, docTags: string, authorKey?: string): boolean {
  const cur = curatedTopics(config, actor);
  if (cur === 'all') return true;
  const topics = roomTopics(config, docTags);
  if (topics.length === 0) return !!authorKey && authorKey === actor.personKey;
  return topics.every(t => cur.includes(t));
}

export function canUploadTo(config: LearningConfig, actor: LearningActor, topic: string): boolean {
  const cur = curatedTopics(config, actor);
  return cur === 'all' || cur.includes(topic);
}
