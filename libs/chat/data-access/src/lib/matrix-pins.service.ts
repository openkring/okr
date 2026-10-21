import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MatrixClient } from 'matrix-js-sdk';

import { expiredSharedPins, MATRIX_PINNED_EVENTS, OKR_PIN_EXPIRY_EVENT } from '@okr/chat-util';

export interface SetChatPinsRequest {
  roomId: string;
  op: 'pin' | 'unpin' | 'cleanup';
  eventId?: string;
  until?: number | null;
}

/**
 * Shared (room-wide) pins (spec 1.109 §4): the pinned ids live in `m.room.pinned_events`, the
 * expiry map in `org.okr.pin_expiry`. Users with the power to write both state events do so
 * directly; everybody else goes through the `setChatPins` callable, which checks membership.
 */
@Injectable({ providedIn: 'root' })
export class MatrixPinsService {
  private client: MatrixClient | null = null;

  setClient(client: MatrixClient | null): void {
    this.client = client;
  }

  sharedPinned(roomId: string): string[] {
    const pinned = this.stateContent(roomId, MATRIX_PINNED_EVENTS)?.['pinned'];
    return Array.isArray(pinned) ? pinned.filter((id): id is string => typeof id === 'string') : [];
  }

  sharedExpiry(roomId: string): Record<string, unknown> {
    return this.stateContent(roomId, OKR_PIN_EXPIRY_EVENT) ?? {};
  }

  canWriteSharedPins(roomId: string): boolean {
    const room = this.client?.getRoom(roomId);
    const userId = this.client?.getUserId();
    if (!room || !userId) return false;
    const state = room.currentState;
    return state.maySendStateEvent(MATRIX_PINNED_EVENTS, userId) && state.maySendStateEvent(OKR_PIN_EXPIRY_EVENT, userId);
  }

  async setSharedPin(roomId: string, eventId: string, until: number | null): Promise<void> {
    if (!this.canWriteSharedPins(roomId)) {
      await this.callPins({ roomId, op: 'pin', eventId, until });
      return;
    }
    const pinned = this.sharedPinned(roomId);
    const nextPinned = pinned.includes(eventId) ? pinned : [...pinned, eventId];
    // Expiry first: a pin never shows up in m.room.pinned_events without its expiry.
    await this.writeExpiry(roomId, { ...this.sharedExpiry(roomId), [eventId]: until });
    await this.writePinned(roomId, nextPinned);
  }

  async removeSharedPin(roomId: string, eventId: string): Promise<void> {
    if (!this.canWriteSharedPins(roomId)) {
      await this.callPins({ roomId, op: 'unpin', eventId });
      return;
    }
    await this.writeUnpinned(roomId, this.sharedPinned(roomId).filter((id) => id !== eventId));
  }

  /** Unpin every shared pin whose expiry has passed; a no-op when none has. */
  async cleanupExpiredSharedPins(roomId: string, now: number): Promise<void> {
    const expired = expiredSharedPins(this.sharedPinned(roomId), this.sharedExpiry(roomId), now);
    if (expired.length === 0) return;
    if (!this.canWriteSharedPins(roomId)) {
      await this.callPins({ roomId, op: 'cleanup' });
      return;
    }
    await this.writeUnpinned(roomId, this.sharedPinned(roomId).filter((id) => !expired.includes(id)));
  }

  /**
   * Unpin / cleanup, in the same order as the `setChatPins` callable: `pinned` first, then the
   * expiry map pruned to the ids still pinned — a failure in between leaves at most a stale
   * expiry entry, never a pin without its expiry.
   */
  private async writeUnpinned(roomId: string, pinned: string[]): Promise<void> {
    await this.writePinned(roomId, pinned);
    const expiry: Record<string, unknown> = {};
    for (const [id, until] of Object.entries(this.sharedExpiry(roomId))) {
      if (pinned.includes(id)) expiry[id] = until;
    }
    await this.writeExpiry(roomId, expiry);
  }

  private async writePinned(roomId: string, pinned: string[]): Promise<void> {
    if (!this.client) throw new Error('MatrixPinsService: client not initialized');
    await this.client.sendStateEvent(roomId, MATRIX_PINNED_EVENTS as never, { pinned } as never, '');
  }

  private async writeExpiry(roomId: string, expiry: Record<string, unknown>): Promise<void> {
    if (!this.client) throw new Error('MatrixPinsService: client not initialized');
    await this.client.sendStateEvent(roomId, OKR_PIN_EXPIRY_EVENT as never, expiry as never, '');
  }

  private async callPins(req: SetChatPinsRequest): Promise<void> {
    await httpsCallable<SetChatPinsRequest, unknown>(getFunctions(getApp(), 'europe-west6'), 'setChatPins')(req);
  }

  private stateContent(roomId: string, type: string): Record<string, unknown> | undefined {
    return this.client?.getRoom(roomId)?.currentState.getStateEvents(type, '')?.getContent();
  }
}
