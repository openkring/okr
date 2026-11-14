import { Injectable, inject, signal } from '@angular/core';
import { PluginListenerHandle } from '@capacitor/core';

import {
  OutboxDelivery, pagesOf, parsePeerMessage, PEER_RECORD_PAGE, PeerMessage, peerPlan, recordsPending, requestedOutboxFiles, sendableDeliveries,
} from '@okr/travel-journal-util';

import { JournalOutboxService } from './journal-outbox.service';
import { JournalPeerService } from './journal-peer.service';
import { LocalPeer, PeerInfo } from './local-peer.plugin';

/**
 * The iPhone as a contributing P2P peer (spec 1.121 §8, 1.154 phase 5 decision 9): it joins the journal's local sync with
 * the cached peer secret and only SENDS. It never sends its own version vector — an iPad answers a vector with every
 * record the sender lacks, and the phone wants none. Per connection:
 *
 * - the iPad sends its vector on connect → the phone sends the records of its deliveries the iPad lacks (pages of
 *   PEER_RECORD_PAGE); deliveries the vector covers are acknowledged;
 * - the iPad asks for every photo file it lacks (`photoReq`, right after the vector and after storing records) → the
 *   phone sends those it holds (sendFile);
 * - `records` and `lock` from an iPad are ignored.
 *
 * An iPad sends its vector only when a connection starts, so after the phone has sent something and the line went quiet,
 * it restarts its side of the link to get a fresh vector — the acknowledgement. A covered delivery becomes «files only»
 * (ruling R9): its records count as delivered, its photo files stay on the phone until an online round uploaded them —
 * photo files have no acknowledgement of their own, so none is ever deleted on a guess. The session ends once no
 * delivery's records wait any more and the line has been quiet (so late photo requests are still answered). An iPad that
 * disappears mid-transfer leaves the records pending; the next connection (now or on a later send) resends what is
 * missing — the iPads store peer records with INSERT OR IGNORE, so a resend is harmless. Only the signed-in person's
 * deliveries are sent (sendableDeliveries), with that person's cached peer secret.
 */
export type OutboxPeerState = 'off' | 'noSecret' | 'busy' | 'searching' | 'sending' | 'done' | 'stopped';

export interface OutboxPeerStatus {
  state: OutboxPeerState;
  journalKey: string;
  peers: string[]; // display names of connected iPads
  pending: number; // deliveries of the journal whose records still wait
  filesOnly: number; // deliveries of the journal whose records arrived, photo files waiting for an online upload
}

const QUIET_MS = 6_000;
const TICK_MS = 1_000;
const MAX_CONFIRM_ROUNDS = 6;
const SESSION_MS = 15 * 60_000;

@Injectable({ providedIn: 'root' })
export class JournalOutboxPeer {
  private readonly outbox = inject(JournalOutboxService);
  private readonly journalPeer = inject(JournalPeerService);
  private readonly statusSignal = signal<OutboxPeerStatus>({ state: 'off', journalKey: '', peers: [], pending: 0, filesOnly: 0 });
  private handles: PluginListenerHandle[] = [];
  private readonly peers = new Map<string, string>(); // peerId → name
  private session?: { journalKey: string; authorKey: string; deviceId: string; displayName: string; secret: string; startedAt: number };
  private lastActivity = 0;
  private sentSinceConfirm = false;
  private confirmRounds = 0;
  private timer?: ReturnType<typeof setInterval>;
  private tickQueued = false;
  private queue: Promise<unknown> = Promise.resolve();

  public readonly status = this.statusSignal.asReadonly();

  /** Starts handing the journal's pending deliveries to any iPad of the journal in reach. */
  public start(journalKey: string, displayName: string): Promise<void> {
    return this.enqueue(async () => {
      await this.stopNow('off');
      await this.outbox.load();
      const authorKey = (await this.outbox.author())?.personKey ?? '';
      const counts = this.countsOf(journalKey, authorKey);
      if (counts.pending === 0) {
        this.statusSignal.set({ state: 'done', journalKey, peers: [], ...counts });
        return;
      }
      // the same app on an iPad: its own journal sync owns the LocalPeer plugin
      if (['searching', 'connected'].includes(this.journalPeer.status().state)) {
        this.statusSignal.set({ state: 'busy', journalKey, peers: [], ...counts });
        return;
      }
      const secret = authorKey ? (await this.outbox.cachedJournals(authorKey)).find((j) => j.journalKey === journalKey)?.secret ?? '' : '';
      if (!secret) {
        this.statusSignal.set({ state: 'noSecret', journalKey, peers: [], ...counts });
        return;
      }
      this.session = { journalKey, authorKey, deviceId: await this.outbox.peerDeviceId(), displayName, secret, startedAt: Date.now() };
      this.handles = await Promise.all([
        LocalPeer.addListener('peerConnected', (p) => void this.enqueue(() => this.onConnected(p))),
        LocalPeer.addListener('peerDisconnected', (p) => this.onDisconnected(p)),
        LocalPeer.addListener('message', (m) => void this.enqueue(() => this.onMessage(m.peerId, m.message))),
      ]);
      await this.startPlugin();
      this.lastActivity = Date.now();
      this.statusSignal.set({ state: 'searching', journalKey, peers: [], ...counts });
      this.timer = setInterval(() => {
        if (this.tickQueued) return; // a long file transfer must not pile up ticks behind it
        this.tickQueued = true;
        void this.enqueue(() => this.tick()).finally(() => (this.tickQueued = false));
      }, TICK_MS);
    });
  }

  /** Stops searching; what has not arrived stays in the outbox. */
  public stop(): Promise<void> {
    return this.enqueue(() => this.stopNow('stopped'));
  }

  // ---------------------------------------------------------------- internals -----------------

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined); // one failed step must not block the next
    return run;
  }

  /** The signed-in person's deliveries of the journal (another person's stay inert). */
  private deliveriesOf(journalKey: string, authorKey: string): OutboxDelivery[] {
    return sendableDeliveries(this.outbox.pending(), authorKey).filter((d) => d.journalKey === journalKey);
  }

  private countsOf(journalKey: string, authorKey: string): { pending: number; filesOnly: number } {
    const mine = this.deliveriesOf(journalKey, authorKey);
    const pending = recordsPending(mine, journalKey).length;
    return { pending, filesOnly: mine.length - pending };
  }

  private async startPlugin(): Promise<void> {
    const s = this.session;
    if (!s) return;
    await LocalPeer.start({ deviceId: s.deviceId, journalKey: s.journalKey, displayName: s.displayName, secret: s.secret });
  }

  private async stopNow(state: OutboxPeerState): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const wasRunning = !!this.session;
    for (const h of this.handles) await h.remove();
    this.handles = [];
    this.peers.clear();
    this.sentSinceConfirm = false;
    this.confirmRounds = 0;
    const journalKey = this.session?.journalKey ?? this.statusSignal().journalKey;
    const authorKey = this.session?.authorKey ?? (await this.outbox.author())?.personKey ?? '';
    this.session = undefined;
    if (wasRunning) await LocalPeer.stop().catch(() => undefined);
    this.statusSignal.set({ state, journalKey, peers: [], ...(journalKey ? this.countsOf(journalKey, authorKey) : { pending: 0, filesOnly: 0 }) });
  }

  private publish(): void {
    const s = this.session;
    if (!s) return;
    const names = [...this.peers.values()];
    this.statusSignal.set({ state: names.length > 0 ? 'sending' : 'searching', journalKey: s.journalKey, peers: names, ...this.countsOf(s.journalKey, s.authorKey) });
  }

  private async send(peerId: string, message: PeerMessage): Promise<void> {
    await LocalPeer.send({ peerId, message: JSON.stringify(message) });
  }

  private async onConnected(peer: PeerInfo): Promise<void> {
    if (!this.session) return;
    this.peers.set(peer.peerId, peer.name);
    this.lastActivity = Date.now();
    this.publish(); // the iPad sends its vector now; the phone waits for it
  }

  private onDisconnected(peer: PeerInfo): void {
    this.peers.delete(peer.peerId);
    this.publish();
  }

  private async onMessage(peerId: string, text: string): Promise<void> {
    const s = this.session;
    if (!s) return;
    const message = parsePeerMessage(text, s.journalKey);
    if (!message) return;
    const now = Date.now();
    this.lastActivity = now;
    const deliveries = this.deliveriesOf(s.journalKey, s.authorKey);
    if (message.t === 'vv') {
      const plan = peerPlan(deliveries, s.journalKey, message.vv);
      for (const deviceId of plan.covered) await this.outbox.markRecordsDone(deviceId); // R9: files stay until online
      if (plan.covered.length > 0) this.publish();
      if (plan.send.length === 0) return;
      for (const page of pagesOf(plan.send, PEER_RECORD_PAGE)) await this.send(peerId, { t: 'records', journalKey: s.journalKey, records: page });
      this.sentSinceConfirm = true;
      this.lastActivity = Date.now();
      return;
    }
    if (message.t === 'photoReq') {
      const files = requestedOutboxFiles(deliveries, s.journalKey, message.files);
      if (files.length === 0) return;
      for (const file of files) {
        await LocalPeer.sendFile({ peerId, file }).catch((error: unknown) => console.warn('journal outbox: a photo was not sent', file, error));
      }
      this.lastActivity = Date.now(); // files need no confirm round: they stay until an online upload anyway
    }
    // 'records' and 'lock': the phone holds no journal — ignored
  }

  private async tick(): Promise<void> {
    const s = this.session;
    if (!s) return;
    const now = Date.now();
    // every delivery's records arrived and the line is quiet (late photo requests were answered): done
    if (this.countsOf(s.journalKey, s.authorKey).pending === 0 && now - this.lastActivity >= QUIET_MS) {
      await this.stopNow('done');
      return;
    }
    // the session's time is up, or every acknowledgement round was used and the line is quiet again: stop searching
    // (the deliveries stay pending, the next send or online round takes them)
    const roundsUsed = this.confirmRounds >= MAX_CONFIRM_ROUNDS && now - this.lastActivity >= QUIET_MS;
    if (now - s.startedAt > SESSION_MS || roundsUsed) {
      await this.stopNow('stopped');
      return;
    }
    // sent something and the line is quiet: a fresh connection brings the iPad's vector — the acknowledgement
    if (this.sentSinceConfirm && this.peers.size > 0 && now - this.lastActivity >= QUIET_MS && this.confirmRounds < MAX_CONFIRM_ROUNDS) {
      this.confirmRounds++;
      this.sentSinceConfirm = false;
      this.peers.clear();
      await LocalPeer.stop().catch(() => undefined);
      await this.startPlugin();
      this.lastActivity = Date.now();
    }
    this.publish();
  }
}
