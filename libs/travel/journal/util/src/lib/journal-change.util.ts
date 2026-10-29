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
