import { InstrumentModel, InstrumentTopic, InstrumentType } from '@okr/shared-models';
import { addIndexElement, isType } from '@okr/shared-util-core';

/*-------------------------- type guard --------------------------------*/

export function isInstrument(instrument: unknown, tenantId: string): instrument is InstrumentModel {
  return isType(instrument, new InstrumentModel(tenantId));
}

/*-------------------------- source links (OQ-3) --------------------------------*/

/**
 * Resolved display info for a topic's linked entity (its `sourceType`/`sourceKey`). The primitive
 * is dumb, so a consumer resolves the foreign entity via data-access and passes this down; the
 * board renders a source chip and the derived `status` on the card, keyed by `topic.key`.
 */
export interface InstrumentTopicSource {
  icon?: string;   // svgIcon name for the linked entity (falls back to a generic link icon)
  label?: string;  // resolved display name of the linked entity
  status?: string; // derived status text (e.g. the linked task's state)
}

/** Whether a topic links back to another entity. */
export function hasSource(topic: InstrumentTopic): boolean {
  return (topic.sourceKey ?? '').length > 0;
}

/** The polymorphic reference `{ type, key }` of a topic's link, or `undefined` when unlinked. */
export function topicSourceRef(topic: InstrumentTopic): { type: string; key: string } | undefined {
  return hasSource(topic) ? { type: topic.sourceType, key: topic.sourceKey } : undefined;
}

/*-------------------------- factories --------------------------------*/

/** A new, empty instrument of the given type for the tenant. */
export function createInstrument(tenantId: string, type: InstrumentType, name = ''): InstrumentModel {
  const instrument = new InstrumentModel(tenantId);
  instrument.type = type;
  instrument.name = name;
  return instrument;
}

/**
 * A new topic card for a cell. `rank` starts empty ('' = not yet ranked → sorts by key until the
 * first drag); the store assigns a real rank on drop via `rankForInsertion`.
 */
export function createTopic(cell: string, label = ''): InstrumentTopic {
  return {
    key: crypto.randomUUID(),
    cell,
    rank: '',
    label,
    description: '',
    color: '',
    score: { impact: 0, horizon: 0 },
    sourceType: '',
    sourceKey: '',
  };
}

/*-------------------------- search index --------------------------------*/

/** Build the search index for an instrument from its name, type and topic labels. */
export function getInstrumentIndex(instrument: InstrumentModel): string {
  let index = '';
  index = addIndexElement(index, 'n', instrument.name);
  index = addIndexElement(index, 't', instrument.type);
  const topicLabels = instrument.topics.map(topic => topic.label).filter(label => label.length > 0).join(' ');
  if (topicLabels.length > 0) {
    index = addIndexElement(index, 'tp', topicLabels);
  }
  return index;
}

/** Human-readable explanation of the index structure (for GUI info boxes). */
export function getInstrumentIndexInfo(): string {
  return 'n:name, t:type, tp:topicLabels';
}
