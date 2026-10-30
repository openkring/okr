import { Injectable, inject } from '@angular/core';
import { doc, getDocFromServer, serverTimestamp, writeBatch } from 'firebase/firestore';

import { FIRESTORE } from '@okr/shared-config';
import { JournalChange, JournalChangeCollection, JournalCollection } from '@okr/shared-models';
import {
  ChangeStamp, createChange, formatHlc, isNewJournalRefusal, isWebDeviceId, maxSeqOf, mergeStamps, parseStamp, receiveClocksInto,
} from '@okr/travel-journal-util';

import { ChangeDraft } from './journal-identity.service';

/**
 * Browser editing (spec 1.126 phase 3 §1, §2): the browser writes its change records straight to
 * Firestore `journal-changes`, in the same shape the iPad uploads. One device id per browser profile;
 * every tab of the profile shares its stamp through localStorage under a Web Lock, because two records
 * with the same (deviceId, seq) would collide on the iPads' unique index (INSERT OR IGNORE drops one).
 *
 * A commit the server has not confirmed within 30 s is «slow», not failed: the web SDK keeps retrying
 * it. A refusal is final — except permission-denied on a journal that is not materialised yet, which
 * the function writes about a second after the journal's create record.
 */
const KEY_DEVICE = 'okr.journal.deviceId';
const KEY_HLC = 'okr.journal.hlc';
const KEY_SEQ = 'okr.journal.seq';
const STAMP_LOCK = 'okr.journal.stamp';
const COMMIT_TIMEOUT_MS = 30_000;
const NEW_JOURNAL_PAUSES_MS = [1000, 2000, 4000, 8000];

interface LockManagerLike { request<T>(name: string, callback: () => T | Promise<T>): Promise<T> }

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code.replace(/^(firestore|functions)\//, '') : undefined;
}

function readStorage(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: string): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function newUuid(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch { /* insecure context: fall through */ }
  const hex = () => Math.floor(Math.random() * 0x1_0000_0000).toString(16).padStart(8, '0');
  return `${hex()}-${hex()}-${hex()}-${hex()}`;
}

function lockManager(): LockManagerLike | undefined {
  try {
    const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
    return typeof locks?.request === 'function' ? locks : undefined;
  } catch {
    return undefined;
  }
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable({ providedIn: 'root' })
export class JournalWebWriter {
  private readonly firestore = inject(FIRESTORE);
  private memory: ChangeStamp = { clock: undefined, seq: 0 };

  /** The profile's device id (created on first use; kept in memory when storage is unavailable). */
  public readonly deviceId: string = JournalWebWriter.loadDeviceId();

  private static loadDeviceId(): string {
    const stored = readStorage(KEY_DEVICE);
    if (isWebDeviceId(stored)) return stored;
    const id = newUuid();
    writeStorage(KEY_DEVICE, id);
    return id;
  }

  /** Stamps drafts for `authorKey` (Web Lock around read-merge-write of the localStorage stamp; `known` = loaded records for maxSeqOf). */
  public stamp(drafts: ChangeDraft[], authorKey: string, known: readonly JournalChange[]): Promise<JournalChange[]> {
    const run = () => this.stampLocked(drafts, authorKey, known);
    const locks = lockManager();
    return locks ? locks.request(STAMP_LOCK, run) : Promise.resolve().then(run);
  }

  /** Synchronous on purpose: nothing may wait on the network while the lock is held. */
  private stampLocked(drafts: ChangeDraft[], authorKey: string, known: readonly JournalChange[]): JournalChange[] {
    const deviceId = this.deviceId;
    let stamp = this.loadStamp(known);
    const changes: JournalChange[] = [];
    for (const draft of drafts) {
      const next = createChange({ ...draft, id: newUuid(), deviceId, authorKey }, stamp, Date.now());
      changes.push(next.change);
      stamp = next.stamp;
    }
    this.saveStamp(stamp);
    return changes;
  }

  /** Commits one batch (records of one journal). Resolves 'confirmed'; 'slow' after 30 s (the SDK keeps trying); rejects on refusal after the new-journal retries. */
  public async commit(changes: JournalChange[], tenantId: string): Promise<'confirmed' | 'slow'> {
    if (changes.length === 0) return 'confirmed';
    const journalKey = changes[0].journalKey;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.commitOnce(changes, tenantId);
      } catch (error) {
        if (attempt >= NEW_JOURNAL_PAUSES_MS.length) throw error;
        const code = errorCode(error);
        if (code !== 'permission-denied') throw error;
        if (!isNewJournalRefusal(code, await this.journalExists(journalKey))) throw error;
        await pause(NEW_JOURNAL_PAUSES_MS[attempt]);
      }
    }
  }

  /** Moves the clock past received records (accepted hlcs only). */
  public receiveClocks(hlcs: readonly string[]): void {
    if (hlcs.length === 0) return;
    const run = () => this.saveStamp(receiveClocksInto(this.loadStamp([]), hlcs, this.deviceId, Date.now()));
    const locks = lockManager();
    if (!locks) { run(); return; }
    locks.request(STAMP_LOCK, run).catch(() => run());
  }

  // ---------------------------------------------------------------- internals ---------------

  private loadStamp(known: readonly JournalChange[]): ChangeStamp {
    const stored = parseStamp(readStorage(KEY_HLC), readStorage(KEY_SEQ), this.deviceId, maxSeqOf(known, this.deviceId));
    return mergeStamps(this.memory, stored);
  }

  private saveStamp(stamp: ChangeStamp): void {
    if (stamp.clock) writeStorage(KEY_HLC, formatHlc(stamp.clock));
    writeStorage(KEY_SEQ, String(stamp.seq));
    this.memory = stamp;
  }

  /** A fresh batch per attempt: a rejected batch cannot be committed again. */
  private commitOnce(changes: JournalChange[], tenantId: string): Promise<'confirmed' | 'slow'> {
    const batch = writeBatch(this.firestore);
    for (const c of changes) {
      batch.set(doc(this.firestore, JournalChangeCollection, c.id), { ...c, tenants: [tenantId], uploadedAt: serverTimestamp() });
    }
    return new Promise<'confirmed' | 'slow'>((resolve, reject) => {
      const timer = setTimeout(() => resolve('slow'), COMMIT_TIMEOUT_MS); // the SDK's pending write stays queued
      batch.commit().then(
        () => { clearTimeout(timer); resolve('confirmed'); },
        (e: unknown) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  /**
   * Rules deny reading a journal that does not exist (`resource != null`), so a denied read counts as
   * «not yet». Any other read failure counts as «exists»: no retry, the commit's own error is rethrown.
   */
  private async journalExists(journalKey: string): Promise<boolean> {
    try {
      return (await getDocFromServer(doc(this.firestore, JournalCollection, journalKey))).exists();
    } catch (error) {
      return errorCode(error) !== 'permission-denied';
    }
  }
}
