import { Injectable, inject, signal } from '@angular/core';
import { PluginListenerHandle } from '@capacitor/core';

import { JournalChange } from '@okr/shared-models';
import { acceptPeerRecords, JournalLock, missingFor, pagesOf, parsePeerMessage, PEER_RECORD_PAGE, PeerMessage, versionVector } from '@okr/travel-journal-util';

import { JournalDb } from './journal-db';
import { JournalIdentityService } from './journal-identity.service';
import { JournalPhotos } from './journal-photos.plugin';
import { LocalPeer, PeerInfo } from './local-peer.plugin';

/**
 * Sync between the two iPads of a journal without Internet (spec 1.113 §5.4, plan 5). The LocalPeer
 * plugin finds the other iPad and gives an authenticated, encrypted connection; this service exchanges
 * version vectors, then the missing records, then the missing photo files. The sender keeps no state per
 * peer: every (re)connect starts with a fresh vector exchange. Records from the peer stay pending for this
 * device's Firebase upload.
 */
export interface JournalPeerContext {
  journalKey: string;
  displayName: string;
  /** The in-memory change log of this device. */
  changes: () => JournalChange[];
  /** Every photo file the journal's images name (plan 4 `allPhotoFiles`). */
  photoFiles: () => string[];
  onRecordsStored: () => Promise<void>;
  onPhotosStored: () => void;
  /** A lock (or release, until 0) another iPad sent. */
  onLock: (lock: JournalLock) => void;
}

export type JournalPeerState = 'off' | 'noSecret' | 'searching' | 'connected';

export interface JournalPeerStatus {
  state: JournalPeerState;
  peers: string[]; // display names of connected iPads
  received: number; // records received from peers since the start
}

const META_PEER = 'peerSecret:';
const FILE_CHUNK = 50;

@Injectable({ providedIn: 'root' })
export class JournalPeerService {
  private readonly db = inject(JournalDb);
  private readonly identity = inject(JournalIdentityService);
  private readonly statusSignal = signal<JournalPeerStatus>({ state: 'off', peers: [], received: 0 });
  private ctx?: JournalPeerContext;
  private handles: PluginListenerHandle[] = [];
  private readonly peers = new Map<string, string>(); // peerId → name
  // files already asked for per peer: records arrive in pages, and each page would ask again
  private readonly requested = new Map<string, Set<string>>();
  private queue: Promise<unknown> = Promise.resolve();

  public readonly status = this.statusSignal.asReadonly();

  /** Starts P2P for one journal; a second call for the same journal only refreshes the context. */
  public start(ctx: JournalPeerContext): Promise<void> {
    return this.enqueue(async () => {
      if (this.ctx?.journalKey === ctx.journalKey && this.statusSignal().state !== 'off' && this.statusSignal().state !== 'noSecret') {
        this.ctx = ctx;
        return;
      }
      await this.stopNow();
      const secret = await this.db.getMeta(META_PEER + ctx.journalKey);
      if (!secret) {
        this.statusSignal.set({ state: 'noSecret', peers: [], received: 0 });
        return;
      }
      await this.identity.init();
      this.ctx = ctx;
      this.handles = await Promise.all([
        LocalPeer.addListener('peerConnected', (p) => void this.enqueue(() => this.onConnected(p))),
        LocalPeer.addListener('peerDisconnected', (p) => this.onDisconnected(p)),
        LocalPeer.addListener('message', (m) => void this.enqueue(() => this.onMessage(m.peerId, m.message))),
        LocalPeer.addListener('fileReceived', (f) => void this.enqueue(() => this.onFile(f.file))),
      ]);
      await LocalPeer.start({ deviceId: this.identity.deviceId(), journalKey: ctx.journalKey, displayName: ctx.displayName, secret });
      this.statusSignal.set({ state: 'searching', peers: [], received: 0 });
    });
  }

  public stop(): Promise<void> {
    return this.enqueue(() => this.stopNow());
  }

  /** Sends this device's new records to every connected peer right away (a write while connected). */
  public push(changes: JournalChange[]): void {
    const ctx = this.ctx;
    if (!ctx || this.peers.size === 0) return;
    const records = changes.filter((c) => c.journalKey === ctx.journalKey);
    if (records.length === 0) return;
    void this.enqueue(async () => {
      for (const peerId of this.peers.keys()) await this.sendRecords(peerId, records);
    });
  }

  /** Sends an edit lock (or a release, `until: 0`) to every connected peer right away. */
  public pushLock(lock: JournalLock): void {
    const ctx = this.ctx;
    if (!ctx || this.peers.size === 0 || lock.journalKey !== ctx.journalKey) return;
    void this.enqueue(async () => {
      for (const peerId of this.peers.keys()) await this.send(peerId, { t: 'lock', journalKey: ctx.journalKey, lock });
    });
  }

  private async stopNow(): Promise<void> {
    for (const h of this.handles) await h.remove();
    this.handles = [];
    this.peers.clear();
    this.requested.clear();
    this.ctx = undefined;
    await LocalPeer.stop().catch(() => undefined);
    this.statusSignal.set({ state: 'off', peers: [], received: 0 });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined); // one failed step must not block the next
    return run;
  }

  private publishPeers(): void {
    const names = [...this.peers.values()];
    this.statusSignal.update((s) => ({ ...s, state: names.length > 0 ? 'connected' : 'searching', peers: names }));
  }

  private async send(peerId: string, message: PeerMessage): Promise<void> {
    await LocalPeer.send({ peerId, message: JSON.stringify(message) });
  }

  private async sendRecords(peerId: string, records: JournalChange[]): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const page of pagesOf(records, PEER_RECORD_PAGE)) {
      await this.send(peerId, { t: 'records', journalKey: ctx.journalKey, records: page });
    }
  }

  private async onConnected(peer: PeerInfo): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    this.peers.set(peer.peerId, peer.name);
    this.requested.set(peer.peerId, new Set()); // a (re)connect starts over
    this.publishPeers();
    await this.send(peer.peerId, { t: 'vv', journalKey: ctx.journalKey, vv: versionVector(ctx.changes(), ctx.journalKey) });
    await this.requestPhotos(peer.peerId);
  }

  private onDisconnected(peer: PeerInfo): void {
    this.peers.delete(peer.peerId);
    this.requested.delete(peer.peerId);
    this.publishPeers();
  }

  private async onMessage(peerId: string, text: string): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const message = parsePeerMessage(text, ctx.journalKey);
    if (!message) return;
    switch (message.t) {
      case 'vv':
        await this.sendRecords(peerId, missingFor(ctx.changes(), ctx.journalKey, message.vv));
        return;
      case 'records': {
        const accepted = acceptPeerRecords(message.records, ctx.journalKey, Date.now());
        if (accepted.length === 0) return;
        await this.db.appendPeerChanges(accepted);
        await this.identity.receiveClocks(accepted.map((c) => c.hlc));
        this.statusSignal.update((s) => ({ ...s, received: s.received + accepted.length }));
        await ctx.onRecordsStored();
        await this.requestPhotos(peerId); // new image records name files this iPad does not have yet
        return;
      }
      case 'lock':
        ctx.onLock(message.lock);
        return;
      case 'photoReq': {
        const { files } = await JournalPhotos.presentFiles({ journalKey: ctx.journalKey, files: message.files });
        for (const file of files) await LocalPeer.sendFile({ peerId, file }).catch(() => undefined);
        return;
      }
    }
  }

  private async requestPhotos(peerId: string): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const wanted = ctx.photoFiles();
    if (wanted.length === 0) return;
    const present = new Set<string>();
    for (const chunk of pagesOf(wanted, FILE_CHUNK)) {
      for (const file of (await JournalPhotos.presentFiles({ journalKey: ctx.journalKey, files: chunk })).files) present.add(file);
    }
    const asked = this.requested.get(peerId) ?? new Set<string>();
    const missing = wanted.filter((f) => !present.has(f) && !asked.has(f));
    for (const file of missing) asked.add(file);
    this.requested.set(peerId, asked);
    for (const chunk of pagesOf(missing, FILE_CHUNK)) await this.send(peerId, { t: 'photoReq', journalKey: ctx.journalKey, files: chunk });
  }

  private async onFile(file: string): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await this.db.notePhotoFiles(ctx.journalKey, [file], true);
    ctx.onPhotosStored();
  }
}
