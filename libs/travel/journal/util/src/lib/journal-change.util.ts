import { JournalChange, JournalChangeOp, JournalEntity } from '@okr/shared-models';
import { formatHlc, Hlc, tickHlc } from './journal-hlc.util';

/**
 * Creating change records (spec 1.113 §5.1). Every write of the travel journal goes through here, so
 * each record carries the device's next sequence number and a clock that never runs backwards.
 */
export interface ChangeStamp { clock: Hlc | undefined; seq: number }

export interface NewChange {
  id: string;
  journalKey: string;
  deviceId: string;
  authorKey: string;
  entity: JournalEntity;
  entityKey: string;
  op: JournalChangeOp;
  fields: Record<string, unknown>;
  bases?: Record<string, string>;
}

export function createChange(input: NewChange, last: ChangeStamp, now: number): { change: JournalChange; stamp: ChangeStamp } {
  const clock = tickHlc(last.clock, now, input.deviceId);
  const seq = last.seq + 1;
  const change: JournalChange = {
    id: input.id,
    journalKey: input.journalKey,
    deviceId: input.deviceId,
    seq,
    hlc: formatHlc(clock),
    authorKey: input.authorKey,
    entity: input.entity,
    entityKey: input.entityKey,
    op: input.op,
    fields: { ...input.fields },
    ...(input.bases ? { bases: { ...input.bases } } : {}),
  };
  return { change, stamp: { clock, seq } };
}

/** A well-formed `bases` (spec 1.126 §6.1): field → hlc of the value the edit was made on top of. */
export function isBases(b: unknown): b is Record<string, string> {
  return typeof b === 'object' && b !== null && !Array.isArray(b) && Object.values(b).every((v) => typeof v === 'string');
}

/**
 * A record from storage or the network with its `bases` shape-checked: a malformed `bases` is dropped, so
 * the record counts as legacy (latest wins) instead of feeding garbage into the conflict rule.
 */
export function withCheckedBases<T extends { bases?: unknown }>(change: T): Omit<T, 'bases'> & { bases?: Record<string, string> } {
  const { bases, ...rest } = change;
  return isBases(bases) ? { ...rest, bases } : rest;
}
