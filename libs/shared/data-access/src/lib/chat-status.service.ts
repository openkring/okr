import { computed, inject, Injectable, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { AUTH, FIRESTORE } from '@okr/shared-config';
import { ChatBlockedError, ChatExemption, ChatStatusCollection, ChatStatusDocId, ChatStatusModel } from '@okr/shared-models';
import { addChatExemption, DateFormat, getTodayStr, isBrowser, isChatEffectivelyBlocked, removeChatExemption } from '@okr/shared-util-core';

/**
 * Global chat switch (app-status/chat). Fail-open: no snapshot, a listener error or a missing
 * doc all mean "not blocked". Must not import anything from @okr/chat-* (bundle constraint).
 * Does not know the current user: consumers pass the personKey (see isEffectivelyBlocked).
 * Watches the Firebase auth state only to re-read the status at once after a login: the read is
 * denied while signed out, and a stale fail-open state must not let a blocked user connect.
 */
const RETRY_INITIAL_MS = 5000;
const RETRY_MAX_MS = 60000;

@Injectable({ providedIn: 'root' })
export class ChatStatusService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AUTH);

  private readonly _status = signal<ChatStatusModel | undefined>(undefined);
  private readonly _ready = signal(false);
  private started = false;
  /** True only while the last listener event was a successful snapshot. */
  private loaded = false;
  private unsubscribe: (() => void) | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelayMs = RETRY_INITIAL_MS;
  private unsubscribeAuth: (() => void) | undefined;

  public readonly status = this._status.asReadonly();
  public readonly ready = this._ready.asReadonly();
  public readonly blocked = computed(() => this.status()?.blocked === true);
  public readonly message = computed(() => this.status()?.message ?? '');

  constructor() {
    this.start();
  }

  public ngOnDestroy(): void {
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = undefined;
    this.stopListening();
  }

  public isExempt(personKey: string | undefined): boolean {
    if (!personKey) return false;
    return (this.status()?.exempt ?? []).some((e) => e.personKey === personKey);
  }

  public isEffectivelyBlocked(personKey: string | undefined): boolean {
    return isChatEffectivelyBlocked(this.status(), personKey);
  }

  /** Resolves when the first snapshot (or a listener error) arrived, or after timeoutMs (fail-open). */
  public whenReady(timeoutMs = 3000): Promise<void> {
    if (this._ready()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, timeoutMs);
      const iv = setInterval(() => { if (this._ready()) done(); }, 25);
      function done(): void { clearTimeout(t); clearInterval(iv); resolve(); }
    });
  }

  /**
   * Gate for opening a Matrix session: waits (bounded) for the status, then throws
   * ChatBlockedError if chat is blocked for this person. Fail-open on timeout or listener error.
   */
  public async assertNotBlocked(personKey: string | undefined): Promise<void> {
    await this.whenReady();
    if (this.isEffectivelyBlocked(personKey)) throw new ChatBlockedError();
  }

  public async block(message: string, admin: ChatExemption): Promise<void> {
    await this.requireLoaded();
    const now = this.now();
    await this.write({
      blocked: true, message, blockedAt: now, blockedBy: admin.personKey,
      exempt: addChatExemption(this._status()?.exempt, admin),
      updatedAt: now, updatedBy: admin.personKey,
    });
  }

  public async unblock(adminPersonKey: string): Promise<void> {
    await this.write({ blocked: false, ...this.updated(adminPersonKey) });
  }

  public async updateMessage(message: string, adminPersonKey: string): Promise<void> {
    await this.write({ message, ...this.updated(adminPersonKey) });
  }

  public async addExemption(entry: ChatExemption, adminPersonKey: string): Promise<void> {
    await this.requireLoaded();
    await this.write({ exempt: addChatExemption(this._status()?.exempt, entry), ...this.updated(adminPersonKey) });
  }

  public async removeExemption(personKey: string, adminPersonKey: string): Promise<void> {
    await this.requireLoaded();
    await this.write({ exempt: removeChatExemption(this._status()?.exempt, personKey), ...this.updated(adminPersonKey) });
  }

  private now(): string {
    return getTodayStr(DateFormat.StoreDateTime);
  }

  private updated(adminPersonKey: string): Pick<ChatStatusModel, 'updatedAt' | 'updatedBy'> {
    return { updatedAt: this.now(), updatedBy: adminPersonKey };
  }

  private async write(patch: Partial<ChatStatusModel>): Promise<void> {
    await setDoc(doc(this.firestore, ChatStatusCollection, ChatStatusDocId), patch, { merge: true });
  }

  /** Exempt-list writes are read-modify-write; refuse to run against an unloaded cache. */
  private async requireLoaded(): Promise<void> {
    await this.whenReady();
    if (!this.loaded) throw new Error('ChatStatusService: status not loaded, refusing to modify the exemption list');
  }

  private start(): void {
    if (this.started || !isBrowser(this.platformId)) return;
    this.started = true;
    this.subscribe();
    this.unsubscribeAuth = onAuthStateChanged(this.auth, (user) => this.onAuthChange(user));
  }

  /**
   * Signed in: unless a healthy listener is already live, drop the stale (fail-open) state and
   * read again now — not after the backoff — so whenReady() waits for the real status.
   * Signed out: the read is denied anyway; stop listening and stay fail-open (not blocked).
   */
  private onAuthChange(user: User | null): void {
    if (user) {
      if (this.loaded && this.unsubscribe) return;
      this.stopListening();
      this.retryDelayMs = RETRY_INITIAL_MS;
      this._ready.set(false);
      this.subscribe();
    } else {
      this.stopListening();
      this.retryDelayMs = RETRY_INITIAL_MS;
      this._status.set(undefined);
      this._ready.set(true);
    }
  }

  private stopListening(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.loaded = false;
  }

  private subscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = onSnapshot(
      doc(this.firestore, ChatStatusCollection, ChatStatusDocId),
      (snap) => {
        this.loaded = true;
        this.retryDelayMs = RETRY_INITIAL_MS;
        this._status.set(snap.exists() ? (snap.data() as ChatStatusModel) : undefined);
        this._ready.set(true);
      },
      () => {
        // fail-open now, resubscribe with backoff
        this._status.set(undefined);
        this._ready.set(true);
        this.stopListening();
        const delay = this.retryDelayMs;
        this.retryDelayMs = Math.min(delay * 2, RETRY_MAX_MS);
        this.retryTimer = setTimeout(() => this.subscribe(), delay);
      },
    );
  }
}
