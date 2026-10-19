import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { FIRESTORE } from '@okr/shared-config';
import { ChatExemption, ChatStatusCollection, ChatStatusDocId, ChatStatusModel } from '@okr/shared-models';
import { addChatExemption, DateFormat, getTodayStr, isBrowser, isChatEffectivelyBlocked, removeChatExemption } from '@okr/shared-util-core';

/**
 * Global chat switch (app-status/chat). Fail-open: no snapshot, a listener error or a missing
 * doc all mean "not blocked". Must not import anything from @okr/chat-* (bundle constraint).
 * Does not know the current user: consumers pass the personKey (see isEffectivelyBlocked).
 */
@Injectable({ providedIn: 'root' })
export class ChatStatusService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly firestore = inject(FIRESTORE);

  private readonly _status = signal<ChatStatusModel | undefined>(undefined);
  private readonly _ready = signal(false);
  private started = false;

  private readonly statusSignal = computed(() => { this.start(); return this._status(); });
  private readonly readySignal = computed(() => { this.start(); return this._ready(); });

  public readonly status = this.statusSignal;
  public readonly ready = this.readySignal;
  public readonly blocked = computed(() => this.status()?.blocked === true);
  public readonly message = computed(() => this.status()?.message ?? '');

  public isExempt(personKey: string | undefined): boolean {
    if (!personKey) return false;
    return (this.status()?.exempt ?? []).some((e) => e.personKey === personKey);
  }

  public isEffectivelyBlocked(personKey: string | undefined): boolean {
    return isChatEffectivelyBlocked(this.status(), personKey);
  }

  /** Resolves when the first snapshot (or a listener error) arrived, or after timeoutMs (fail-open). */
  public whenReady(timeoutMs = 3000): Promise<void> {
    this.start();
    if (this._ready()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, timeoutMs);
      const iv = setInterval(() => { if (this._ready()) done(); }, 25);
      function done(): void { clearTimeout(t); clearInterval(iv); resolve(); }
    });
  }

  public async block(message: string, admin: ChatExemption): Promise<void> {
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
    await this.write({ exempt: addChatExemption(this._status()?.exempt, entry), ...this.updated(adminPersonKey) });
  }

  public async removeExemption(personKey: string, adminPersonKey: string): Promise<void> {
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

  private start(): void {
    if (this.started || !isBrowser(this.platformId)) return;
    this.started = true;
    onSnapshot(
      doc(this.firestore, ChatStatusCollection, ChatStatusDocId),
      (snap) => {
        this._status.set(snap.exists() ? (snap.data() as ChatStatusModel) : undefined);
        this._ready.set(true);
      },
      () => {
        this._status.set(undefined);
        this._ready.set(true);
      },
    );
  }
}
