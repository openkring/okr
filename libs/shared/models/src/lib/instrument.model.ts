import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { NamedModel, OkrModel, PersistedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * The kind of grid instrument. Selects which `GridDefinition` (@okr/instruments-util) renders the
 * document. All four are the same primitive — a declarative grid + ranked topic cards — differing
 * only in their cell layout. The free-canvas Whiteboard (2.24.1) and the moderated Brainstorming
 * session (2.24.6) are deliberately NOT instrument types: they are separate primitives, not grids.
 */
export type InstrumentType = 'swot' | 'pestel' | 'bmc' | 'eisenhower';

/**
 * A typed score the primitive is aware of (spec OQ-1, resolved 2026-07-22: typed score, not a
 * repurposed colour). Both axes are 0 = unset. `impact` is the single-axis weighting SWOT wants;
 * PESTEL uses both `impact` and `horizon`. Positional instruments (Eisenhower, BMC) leave them 0.
 */
export interface InstrumentTopicScore {
  impact: number;      // 0 = unset; 1..3 = low / medium / high. SWOT weighting & PESTEL impact.
  horizon: number;     // 0 = unset; 1..3 = short / medium / long term. PESTEL horizon; n.a. elsewhere.
}

export const DEFAULT_TOPIC_SCORE: InstrumentTopicScore = { impact: 0, horizon: 0 };

/**
 * One topic card on an instrument board. Embedded in `InstrumentModel.topics` — an instrument is
 * small and always loaded whole, so no subcollection.
 *
 * `rank` is the fractional lexicographic rank WITHIN `cell` (`rankBetween`/`rankForIndex` from
 * @okr/shared-util-core, the same math the Kanban board uses). A move is a single write of
 * `{ cell, rank }`.
 */
export interface InstrumentTopic {
  key: string;         // local id, unique within the document
  cell: string;        // GridCell.id — which cell the card sits in
  rank: string;        // fractional rank within the cell; '' = not yet ranked
  label: string;
  description: string; // '' when unset
  color: string;       // card tint; purely decorative (scoring lives in `score`, OQ-1)
  score: InstrumentTopicScore; // typed impact/horizon rating (OQ-1)

  // OQ-3 (resolved 2026-07-22) — polymorphic link back to another entity (task / objective / risk).
  // Empty = unlinked. The primitive RENDERS from it (source chip + derived status on the card) and
  // emits an open-source intent; the consumer resolves the linked entity (data-access) and passes
  // the display info down. The reference is the codebase-standard `sourceType`/`sourceKey` pair.
  sourceType: string;  // e.g. 'task' | 'objective' | 'risk' | ''
  sourceKey: string;   // the linked entity's okey, or ''
}

/**
 * A visual strategy/decision instrument stored as one document: a declarative grid (chosen by
 * `type`) filled with draggable topic cards. Discriminated by `type` so a single `instruments`
 * collection and one renderer serve SWOT / PESTEL / BMC / Eisenhower.
 */
export class InstrumentModel implements OkrModel, PersistedModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public type: InstrumentType = 'swot';
  public description = '';

  public author: AvatarInfo | undefined; // the person who created/owns the instrument
  public visibility = '';                // extends visibility beyond author + privileged (see group.model)

  public topics: InstrumentTopic[] = [];

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InstrumentCollection = 'instruments';
export const InstrumentModelName = 'instrument';
