import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { createNewMatrixCall, CallEvent, MsgType, type MatrixCall, type MatrixClient } from 'matrix-js-sdk';

import { UserModel } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { ActivityService } from '@okr/activity-data-access';

import { isKioskOnly } from '@okr/shared-util-core';

import { groupKeyFromRoomAlias, groupRoomAliasLocalpart } from '@okr/chat-util';

import { isServiceAccount } from './matrix-helpers';

/**
 * Power level a caller must hold in the call room before an unattended kiosk device
 * auto-accepts. 100 = room admin in Matrix; the kiosk room's `m.call.invite` power level
 * must be set to the same value so the homeserver rejects everyone else server-side.
 */
export const KIOSK_CALLER_MIN_POWER_LEVEL = 100;

/**
 * WebRTC video-call handling on top of matrix-js-sdk.
 * Extracted from MatrixChatService (design review #4 / ARCH-2); the facade sets
 * the client on initialize/disconnect, forwards incoming calls, and delegates
 * the call API. Call state lives here as the single source of truth.
 */
@Injectable({
  providedIn: 'root'
})
export class MatrixCallService {
  private readonly appStore = inject(AppStore);
  private readonly activityService = inject(ActivityService);

  private client: MatrixClient | null = null;

  private readonly activeCall$ = new BehaviorSubject<MatrixCall | null>(null);
  private readonly callState$ = new BehaviorSubject<string | null>(null);
  private readonly callFeeds$ = new BehaviorSubject<{ stream: MediaStream; isLocal: boolean }[]>([]);

  public get activeCall(): Observable<MatrixCall | null> {
    return this.activeCall$.asObservable();
  }

  public get callState(): Observable<string | null> {
    return this.callState$.asObservable();
  }

  public get callFeeds(): Observable<{ stream: MediaStream; isLocal: boolean }[]> {
    return this.callFeeds$.asObservable();
  }

  /** Attach/detach the Matrix client. Detaching (null) resets all call state. */
  public setClient(client: MatrixClient | null): void {
    this.client = client;
    if (!client) {
      this.activeCall$.next(null);
      this.callState$.next(null);
      this.callFeeds$.next([]);
    }
  }

  /** Wire up an incoming call emitted by the MatrixClient ('Call.incoming'). */
  public handleIncomingCall(call: MatrixCall): void {
    // A kiosk device is unattended: nobody can tap "answer", so it decides for itself.
    // It answers admins automatically and rejects everyone else rather than ring forever.
    if (isKioskOnly(this.appStore.currentUser())) {
      void this.handleKioskIncomingCall(call);
      return;
    }
    this.setupCallListeners(call);
    this.activeCall$.next(call);
    this.callState$.next('ringing');
    // No local notice here — the caller already sent a persistent notice visible to all room members.
  }

  /**
   * Auto-accept on a kiosk device — but only for a caller the homeserver ranks as an admin
   * of the call room (power level >= KIOSK_CALLER_MIN_POWER_LEVEL). The power level is the
   * same state the homeserver itself enforces `m.call.invite` against, so this local check
   * mirrors the server-side rule instead of inventing a second, weaker one.
   */
  private async handleKioskIncomingCall(call: MatrixCall): Promise<void> {
    const currentUser = this.appStore.currentUser();
    const callerId = call.getOpponentMember()?.userId;
    if (!this.isAdminCaller(call, callerId)) {
      void this.activityService.log('chat', 'kioskcall', currentUser, `${call.roomId}: REJECTED caller=${callerId ?? 'unknown'} (not a room admin)`);
      call.reject();
      return;
    }
    this.setupCallListeners(call);
    this.activeCall$.next(call);
    this.callState$.next('ringing');
    try {
      await call.answer(true, true);
      void this.activityService.log('chat', 'kioskcall', currentUser, `${call.roomId}: AUTO-ANSWERED caller=${callerId}`);
    } catch (error) {
      void this.activityService.log('chat', 'kioskcall', currentUser, `${call.roomId}: ERROR auto-answer failed caller=${callerId} (${error})`);
      this.activeCall$.next(null);
      this.callState$.next(null);
    }
  }

  /** True if the caller holds admin power level in the room the call came in on. */
  private isAdminCaller(call: MatrixCall, callerId: string | undefined): boolean {
    if (!callerId || isServiceAccount(callerId)) return false;
    const member = this.client?.getRoom(call.roomId)?.getMember(callerId);
    return (member?.powerLevel ?? 0) >= KIOSK_CALLER_MIN_POWER_LEVEL;
  }

  public async startVideoCall(roomId: string, currentUser: UserModel | undefined): Promise<void> {
    if (!this.client) throw new Error('Matrix not initialized');
    const call = createNewMatrixCall(this.client, roomId);
    if (!call) {
      void this.activityService.log('chat', 'startvideo', currentUser, `${roomId}: ERROR WebRTC not supported`);
      throw new Error('WebRTC not supported or room not found');
    }
    this.setupCallListeners(call);
    this.activeCall$.next(call);
    await call.placeVideoCall();
    void this.activityService.log('chat', 'startvideo', currentUser, `${roomId}: SUCCESS`);
    this.sendNotice(roomId, '📹 Video-Anruf gestartet');
    // Notify other room members via FCM (non-blocking — failure must not abort the call)
    this.notifyCallees(roomId).catch(err =>
      console.warn('MatrixCallService.startVideoCall: FCM notification failed (non-critical):', err)
    );
  }

  public hangupCall(): void {
    const call = this.activeCall$.value;
    if (!call) return;
    this.sendNotice(call.roomId, '📹 Video-Anruf beendet');
    call.hangup('user_hangup' as any, false);
  }

  public async answerCall(): Promise<void> {
    const call = this.activeCall$.value;
    if (call) await call.answer(true, true);
  }

  private async notifyCallees(roomId: string): Promise<void> {
    const room = this.client?.getRoom(roomId);
    const myUserId = this.client?.getUserId();
    if (!room || !myUserId) return;

    const calleeIds = room.getJoinedMembers()
      .map(m => m.userId)
      .filter(id => id !== myUserId && !isServiceAccount(id)); // don't ring service/bot accounts (S1)
    if (calleeIds.length === 0) return;

    const user = this.appStore.currentUser();
    const callerName = user
      ? `${user.firstName} ${user.lastName}`.trim()
      : 'Unbekannt';

    // The group okey behind this room — the CF builds the push deep link from it. Resolved
    // from the group list by identity (matrixRoomId, else the canonical alias), NOT from the
    // room name: a room carries its group's display name, which is free text and no id.
    // undefined for a DM or an unmatched room; the CF then links to the generic chat page.
    const alias = room.getCanonicalAlias() ?? undefined;
    const aliasKey = groupKeyFromRoomAlias(alias);
    const roomKey = this.appStore.allGroupsAndChats().find(g =>
      g.matrixRoomId === roomId || (!!aliasKey && groupRoomAliasLocalpart(g.okey) === `group_${aliasKey}`)
    )?.okey;

    const functions = getFunctions(getApp(), 'europe-west6');
    const fn = httpsCallable(functions, 'sendCallNotification');
    await fn({ roomId, roomName: room.name || '', roomKey: roomKey ?? '', callerName, calleeMatrixUserIds: calleeIds });
  }

  private setupCallListeners(call: MatrixCall): void {
    call.on(CallEvent.FeedsChanged as any, (feeds: any[]) => {
      this.callFeeds$.next(
        feeds.map(f => ({ stream: f.stream as MediaStream, isLocal: f.isLocal() as boolean }))
      );
    });

    call.on(CallEvent.State as any, (state: string) => {
      this.callState$.next(state);
    });

    call.on(CallEvent.Hangup as any, () => this.resetCall());

    // Without this a failed call leaves the overlay up with no way to dismiss it —
    // fatal on an unattended kiosk, and merely annoying in the chat view.
    call.on(CallEvent.Error as any, (error: unknown) => {
      console.warn('MatrixCallService: call error, clearing call state:', error);
      this.resetCall();
    });
  }

  private resetCall(): void {
    this.activeCall$.next(null);
    this.callState$.next(null);
    this.callFeeds$.next([]);
  }

  /** Send a notice message to a room so it persists across reloads. Fire-and-forget. */
  private sendNotice(roomId: string, body: string): void {
    if (!this.client) return;
    this.client.sendMessage(roomId, { msgtype: MsgType.Notice, body } as any).catch(err =>
      console.warn('MatrixCallService.sendNotice failed:', err)
    );
  }
}
