import { isValidHlc, parseHlc } from './journal-hlc.util';
import { ChangeStamp } from './journal-change.util';

/**
 * Who writes on this device (spec 1.113 §5.3a). The author is bound once while online (from the
 * signed-in user); offline the journal reads it from SQLite, because the app's user document is not
 * available after an offline cold start on iOS.
 */
export interface BoundAuthor { personKey: string; name: string }

/** Why a write was refused; the UI shows a message per reason. */
export type JournalWriteRefusal = 'noAuthor' | 'notOwner';

export class JournalWriteRefused extends Error {
  public constructor(public readonly reason: JournalWriteRefusal) {
    super(`journal write refused: ${reason}`);
    this.name = 'JournalWriteRefused';
  }
}

export function serializeBoundAuthor(author: BoundAuthor): string {
  return JSON.stringify({ personKey: author.personKey, name: author.name });
}

export function parseBoundAuthor(raw: string | undefined): BoundAuthor | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<BoundAuthor>;
    if (typeof value.personKey !== 'string' || value.personKey === '') return undefined;
    return { personKey: value.personKey, name: typeof value.name === 'string' ? value.name : '' };
  } catch {
    return undefined;
  }
}

/** The device's last stamp from meta; a missing or foreign clock starts fresh, the sequence never goes back. */
export function parseStamp(rawHlc: string | undefined, rawSeq: string | undefined, deviceId: string): ChangeStamp {
  const seq = Number(rawSeq);
  return {
    clock: rawHlc && isValidHlc(rawHlc, deviceId) ? parseHlc(rawHlc) : undefined,
    seq: Number.isInteger(seq) && seq > 0 ? seq : 0,
  };
}
