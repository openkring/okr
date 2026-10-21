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
    await this.writeBoth(roomId, nextPinned, { ...this.sharedExpiry(roomId), [eventId]: until });
  }

  async removeSharedPin(roomId: string, eventId: string): Promise<void> {
    if (!this.canWriteSharedPins(roomId)) {
      await this.callPins({ roomId, op: 'unpin', eventId });
      return;
    }
    const expiry = { ...this.sharedExpiry(roomId) };
    delete expiry[eventId];
    await this.writeBoth(
      roomId,
      this.sharedPinned(roomId).filter((id) => id !== eventId),
      expiry,
    );
  }

  /** Unpin every shared pin whose expiry has passed; a no-op when none has. */
  async cleanupExpiredSharedPins(roomId: string, now: number): Promise<void> {
    const expired = expiredSharedPins(this.sharedPinned(roomId), this.sharedExpiry(roomId), now);
    if (expired.length === 0) return;
    if (!this.canWriteSharedPins(roomId)) {
      await this.callPins({ roomId, op: 'cleanup' });
      return;
    }
    const expiry = { ...this.sharedExpiry(roomId) };
    for (const id of expired) delete expiry[id];
    await this.writeBoth(
      roomId,
      this.sharedPinned(roomId).filter((id) => !expired.includes(id)),
      expiry,
    );
  }

  private async writeBoth(roomId: string, pinned: string[], expiry: Record<string, unknown>): Promise<void> {
    if (!this.client) throw new Error('MatrixPinsService: client not initialized');
    await this.client.sendStateEvent(roomId, MATRIX_PINNED_EVENTS as never, { pinned } as never, '');
    await this.client.sendStateEvent(roomId, OKR_PIN_EXPIRY_EVENT as never, expiry as never, '');
  }

  private async callPins(req: SetChatPinsRequest): Promise<void> {
    await httpsCallable<SetChatPinsRequest, unknown>(getFunctions(getApp(), 'europe-west6'), 'setChatPins')(req);
  }

  private stateContent(roomId: string, type: string): Record<string, unknown> | undefined {
    return this.client?.getRoom(roomId)?.currentState.getStateEvents(type, '')?.getContent();
  }
}
