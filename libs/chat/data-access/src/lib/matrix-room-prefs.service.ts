import { Injectable, signal } from '@angular/core';
import { ClientEvent, MatrixClient, RoomEvent } from 'matrix-js-sdk';

import {
  MuteContent,
  OKR_HIDDEN_TAG,
  OKR_MUTE_EVENT,
  OKR_PINS_EVENT,
  parseMuteContent,
  withAllMute,
  withoutPersonalPin,
  withoutRoomMute,
  withPersonalPin,
  withRoomMute,
} from '@okr/chat-util';

/**
 * Per-user chat preferences kept in Matrix account data (spec 1.109 §4, §9, §10.1): the global
 * mute (`org.okr.mute`), the hidden tag (`org.okr.hidden`) and the personal pins
 * (`org.okr.pins`, room account data). Every write is a read-modify-write through the
 * pure util transforms; `Date.now()` is taken here at the call site.
 *
 * The client is handed over by MatrixChatService (setClient), like the other delegates, so
 * nothing here bypasses the initialised client (chat maintenance gate, spec 1.107).
 */
@Injectable({ providedIn: 'root' })
export class MatrixRoomPrefsService {
  private client: MatrixClient | null = null;
  private detach: (() => void) | null = null;

  private readonly _muteContent = signal<MuteContent>(parseMuteContent(undefined));
  private readonly _hiddenVersion = signal(0);
  private readonly _pinsVersion = signal(0);

  /** Live global mute content; updated from the `ClientEvent.AccountData` echo. */
  readonly muteContent = this._muteContent.asReadonly();
  /** Bumps whenever any room's tags change (read it to re-evaluate {@link isHidden}). */
  readonly hiddenVersion = this._hiddenVersion.asReadonly();
  /** Bumps whenever room account data changes (read it to re-evaluate {@link personalPins}). */
  readonly pinsVersion = this._pinsVersion.asReadonly();

  // ---- lifecycle, driven by the facade ----

  setClient(client: MatrixClient | null): void {
    this.detach?.();
    this.detach = null;
    this.client = client;
    if (!client) {
      this._muteContent.set(parseMuteContent(undefined));
      this._hiddenVersion.update((v) => v + 1);
      this._pinsVersion.update((v) => v + 1);
      return;
    }
    const readMute = () => this._muteContent.set(parseMuteContent(client.getAccountData(OKR_MUTE_EVENT as never)?.getContent()));
    const onAccountData = (event: { getType(): string }) => {
      if (event.getType() === OKR_MUTE_EVENT) readMute();
    };
    const onTags = () => this._hiddenVersion.update((v) => v + 1);
    const onRoomAccountData = (event: { getType(): string }) => {
      if (event.getType() === OKR_PINS_EVENT) this._pinsVersion.update((v) => v + 1);
    };
    client.on(ClientEvent.AccountData, onAccountData);
    client.on(RoomEvent.Tags, onTags);
    client.on(RoomEvent.AccountData, onRoomAccountData);
    this.detach = () => {
      client.off(ClientEvent.AccountData, onAccountData);
      client.off(RoomEvent.Tags, onTags);
      client.off(RoomEvent.AccountData, onRoomAccountData);
    };
    readMute();
  }

  // ---- mute ----

  async setRoomMute(roomId: string, until: number | null): Promise<void> {
    await this.writeMute((c, now) => withRoomMute(c, roomId, until, now));
  }

  async clearRoomMute(roomId: string): Promise<void> {
    await this.writeMute((c, now) => withoutRoomMute(c, roomId, now));
  }

  /** `until === undefined` clears the tenant's all-mute; `null` mutes it for good. */
  async setAllMute(tenantId: string, until: number | null | undefined): Promise<void> {
    await this.writeMute((c, now) => withAllMute(c, tenantId, until, now));
  }

  private async writeMute(transform: (c: MuteContent, now: number) => MuteContent): Promise<void> {
    const client = this.requireClient('writeMute');
    const current = parseMuteContent(client.getAccountData(OKR_MUTE_EVENT as never)?.getContent());
    const next = transform(current, Date.now());
    await client.setAccountData(OKR_MUTE_EVENT as never, next as never);
    // Optimistic: the AccountData echo confirms it.
    this._muteContent.set(next);
  }

  // ---- hide ----

  isHidden(roomId: string): boolean {
    this._hiddenVersion();
    return !!this.client?.getRoom(roomId)?.tags?.[OKR_HIDDEN_TAG];
  }

  /** Hide = tag + a mute without end (marked `byHide`, so unhide only lifts that mute). */
  async hideRoom(roomId: string): Promise<void> {
    const client = this.requireClient('hideRoom');
    await client.setRoomTag(roomId, OKR_HIDDEN_TAG, {});
    await this.writeMute((c, now) => withRoomMute(c, roomId, null, now, true));
  }

  async unhideRoom(roomId: string): Promise<void> {
    const client = this.requireClient('unhideRoom');
    await client.deleteRoomTag(roomId, OKR_HIDDEN_TAG);
    await this.writeMute((c, now) => withoutRoomMute(c, roomId, now, true));
  }

  // ---- personal pins ----

  personalPins(roomId: string): Record<string, unknown> | undefined {
    this._pinsVersion();
    return this.client?.getRoom(roomId)?.getAccountData(OKR_PINS_EVENT as never)?.getContent();
  }

  async setPersonalPin(roomId: string, eventId: string, until: number | null): Promise<void> {
    const client = this.requireClient('setPersonalPin');
    const next = withPersonalPin(this.personalPins(roomId), eventId, until, Date.now());
    await client.setRoomAccountData(roomId, OKR_PINS_EVENT as never, next as never);
  }

  async removePersonalPin(roomId: string, eventId: string): Promise<void> {
    const client = this.requireClient('removePersonalPin');
    const next = withoutPersonalPin(this.personalPins(roomId), eventId, Date.now());
    await client.setRoomAccountData(roomId, OKR_PINS_EVENT as never, next as never);
  }

  private requireClient(op: string): MatrixClient {
    if (!this.client) throw new Error(`MatrixRoomPrefsService.${op}: client not initialized`);
    return this.client;
  }
}
