import { Injectable, inject, signal } from '@angular/core';
import { JournalChange } from '@okr/shared-models';
import {
  BoundAuthor, ChangeStamp, createChange, formatHlc, JournalWriteRefused, NewChange,
  parseBoundAuthor, parseStamp, serializeBoundAuthor,
} from '@okr/travel-journal-util';
import { JournalDb } from './journal-db';

/** A change before the device stamps it: no id, device, author, seq or clock yet. */
export type ChangeDraft = Omit<NewChange, 'id' | 'deviceId' | 'authorKey'>;

const META_DEVICE = 'deviceId';
const META_AUTHOR = 'author';
const META_HLC = 'hlc';
const META_SEQ = 'seq';

/**
 * The device's identity in the travel journal (spec 1.113 §5.1, §5.3a): a device id created once and
 * kept in SQLite (not Device.getId(): identifierForVendor changes on reinstall), the device clock and
 * sequence, and the author bound while online. All writes run through one queue, so two quick actions
 * never share a sequence number.
 */
@Injectable({ providedIn: 'root' })
export class JournalIdentityService {
  private readonly db = inject(JournalDb);
  private readonly deviceIdSignal = signal('');
  private readonly authorSignal = signal<BoundAuthor | undefined>(undefined);
  private stamp: ChangeStamp = { clock: undefined, seq: 0 };
  private queue: Promise<unknown> = Promise.resolve();
  private initialised?: Promise<void>;

  public readonly deviceId = this.deviceIdSignal.asReadonly();
  public readonly author = this.authorSignal.asReadonly();

  public init(): Promise<void> {
    this.initialised ??= (async () => {
      await this.db.open();
      let deviceId = await this.db.getMeta(META_DEVICE);
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        await this.db.setMeta(META_DEVICE, deviceId);
      }
      this.deviceIdSignal.set(deviceId);
      this.authorSignal.set(parseBoundAuthor(await this.db.getMeta(META_AUTHOR)));
      this.stamp = parseStamp(await this.db.getMeta(META_HLC), await this.db.getMeta(META_SEQ), deviceId);
    })().catch((error: unknown) => {
      this.initialised = undefined;
      throw error;
    });
    return this.initialised;
  }

  /** Called while online with the signed-in person; the binding survives offline cold starts. */
  public async bindAuthor(author: BoundAuthor): Promise<void> {
    await this.init();
    const current = this.authorSignal();
    if (current?.personKey === author.personKey && current.name === author.name) return;
    await this.db.setMeta(META_AUTHOR, serializeBoundAuthor(author));
    this.authorSignal.set(author);
  }

  /**
   * Stamps the drafts in order and stores them, together with the new clock and sequence, in one
   * transaction. Throws JournalWriteRefused('noAuthor') when this device has no bound author.
   */
  public stampChanges(drafts: ChangeDraft[]): Promise<JournalChange[]> {
    const run = this.queue.then(async () => {
      await this.init();
      const author = this.authorSignal();
      if (!author) throw new JournalWriteRefused('noAuthor');
      let stamp = this.stamp;
      const changes: JournalChange[] = [];
      for (const draft of drafts) {
        const result = createChange(
          { ...draft, id: crypto.randomUUID(), deviceId: this.deviceIdSignal(), authorKey: author.personKey },
          stamp,
          Date.now(),
        );
        changes.push(result.change);
        stamp = result.stamp;
      }
      if (changes.length === 0) return changes;
      const meta: Record<string, string> = { [META_SEQ]: String(stamp.seq) };
      if (stamp.clock) meta[META_HLC] = formatHlc(stamp.clock);
      await this.db.appendChanges(changes, meta);
      this.stamp = stamp; // only after the transaction succeeded
      return changes;
    });
    this.queue = run.catch(() => undefined); // a failed write does not block the next one
    return run;
  }
}
