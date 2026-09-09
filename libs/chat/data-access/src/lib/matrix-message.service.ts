import { inject, Injectable } from '@angular/core';
import { captureMessage } from '@sentry/angular';
import { EventTimeline, EventType, MatrixClient, MatrixError, MatrixEvent, RelationType, Room } from 'matrix-js-sdk';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { MatrixMessage, MatrixReadReceipt } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { debugData, debugMessage } from '@okr/shared-util-core';
import { isRenderableChatEvent, isRoomGoneError } from '@okr/chat-util';
import { AvatarService } from '@okr/avatar-data-access';

import { isServiceAccount, mediaMimeHint, personAvatarUrl } from './matrix-helpers';
import { MatrixMediaService } from './matrix-media.service';
import { MatrixRoomListService } from './matrix-room-list.service';

/**
 * Everything that lives inside ONE room's timeline: the message list per room, its
 * back-fill and scroll-up pagination, edits, reactions, polls and read receipts.
 *
 * Extracted from MatrixChatService (design review #4 / ARCH-2). The facade owns the SDK
 * event wiring and forwards each timeline-shaped event here (`handleTimelineEvent`,
 * `handleTimelineReset`, `handleLocalEcho`, `handleRedaction`); sending messages stays on
 * the facade, which owns the client.
 */
@Injectable({
  providedIn: 'root'
})
export class MatrixMessageService {
  private readonly appStore = inject(AppStore);
  private readonly avatarService = inject(AvatarService);
  private readonly media = inject(MatrixMediaService);
  private readonly roomList = inject(MatrixRoomListService);

  private client: MatrixClient | null = null;

  private readonly messages$ = new Map<string, BehaviorSubject<MatrixMessage[] | null>>();
  private readonly receipts$ = new Map<string, BehaviorSubject<Map<string, MatrixReadReceipt[]>>>();
  // C-3: roomIds with a load in progress, so concurrent subscriptions don't double-load.
  private readonly loadingRooms = new Set<string>();
  // C-4: edits whose original message isn't in the list yet (edit arrived before the
  // original on the live timeline). Keyed by original eventId → latest edit event; replayed
  // by handleNewMessage when the original is added. Cleared on disconnect.
  private readonly pendingEdits = new Map<string, MatrixEvent>();
  /** Back-pagination failures already reported this session — see reportPaginationFailure. */
  private readonly reportedPaginationFailures = new Set<string>();
  // Rooms evicted from the local store because the server no longer knows them (see
  // evictGoneRoom). Emits the roomId so the chat view can re-resolve a deep link that landed
  // on the dead room.
  private readonly roomGone$ = new Subject<string>();

  /** How many rendered messages an opened room should carry before back-filling stops. */
  private static readonly MIN_VISIBLE_MESSAGES = 20;
  /** Round cap, so a room made almost entirely of state events cannot spin on /messages. */
  private static readonly MAX_INITIAL_PAGINATIONS = 5;

  // ---- lifecycle, driven by the facade ----

  setClient(client: MatrixClient | null): void {
    this.client = client;
  }

  /** Drop the per-session load state (disconnect). Message lists themselves are kept. */
  clearTransient(): void {
    this.receipts$.clear();
    this.loadingRooms.clear();
    this.pendingEdits.clear();
  }

  /** Emits the id of a room that was evicted because the server no longer knows it. */
  get roomGone(): Observable<string> {
    return this.roomGone$.asObservable();
  }

  private getCurrentUserId(): string | undefined {
    return this.client?.getUserId() ?? undefined;
  }

  // ---- SDK event entry points (wired by the facade) ----

  /**
   * A live-timeline event: a message, an edit, a reaction or a poll event. Historical
   * (pagination) events are filtered out by the caller.
   */
  public handleTimelineEvent(event: MatrixEvent, room: Room): void {
    const eventType = event.getType();

    if (eventType === EventType.RoomMessage) {
      const relatesTo = event.getContent()?.['m.relates_to'];
      if (relatesTo?.rel_type === RelationType.Replace && relatesTo?.event_id) {
        this.applyMessageEdit(relatesTo.event_id as string, event, room);
      } else {
        this.handleNewMessage(event, room);
      }
    } else if (eventType === 'm.reaction') {
      const targetId = event.getContent()?.['m.relates_to']?.event_id as string | undefined;
      if (targetId) this.refreshMessageReactions(targetId, room);
    } else if (eventType === 'org.matrix.msc3381.poll.start') {
      this.handleNewMessage(event, room);
      const pollId = event.getId();
      if (pollId) this.refreshPollTally(pollId, room);
    } else if (eventType === 'org.matrix.msc3381.poll.response') {
      const pollEventId = event.getContent()?.['m.relates_to']?.event_id as string | undefined;
      if (pollEventId) this.refreshPollTally(pollEventId, room);
    } else if (eventType === 'org.matrix.msc3381.poll.end') {
      const pollEventId = event.getContent()?.['m.relates_to']?.event_id as string | undefined;
      if (pollEventId) this.markPollEnded(pollEventId, room);
    }
  }

  /**
   * Rebuild an opened room's message list from the FRESH live timeline after
   * RoomEvent.TimelineReset. Rooms the user never opened have no subject and are skipped.
   */
  public handleTimelineReset(room: Room): void {
    if (!this.messages$.has(room.roomId)) return;
    debugMessage(`MatrixMessageService: Timeline reset for room ${room.roomId} — rebuilding message list from fresh timeline`, this.appStore.currentUser());
    this.loadMessagesForRoom(room.roomId);
  }

  /**
   * When a sent message is confirmed by the server, replace the local-echo entry
   * (temp ID like ~!room:id.$local) with the confirmed event (real server ID).
   */
  public handleLocalEcho(event: MatrixEvent, room: Room, oldEventId?: string): void {
    const et = event.getType();
    if (et !== EventType.RoomMessage && et !== 'org.matrix.msc3381.poll.start') return;

    // An m.replace edit is not a message of its own — it patches the original in place.
    // Without this branch the local echo of an edit has no temp entry to replace and is
    // appended as a second bubble carrying the `* <text>` fallback body, so an edited
    // message appears twice until the room is reloaded.
    const echoRelatesTo = event.getContent()?.['m.relates_to'];
    if (echoRelatesTo?.rel_type === RelationType.Replace && echoRelatesTo?.event_id) {
      this.applyMessageEdit(echoRelatesTo.event_id as string, event, room);
      return;
    }

    const subject = this.messages$.get(room.roomId);
    if (!subject) return;
    const msgs = subject.value ?? [];
    const oldIdx = oldEventId ? msgs.findIndex(m => m.eventId === oldEventId) : -1;
    const baseMsg = this.mapEventToMessage(event, room);
    // For poll.start: preserve tally fields from the existing entry (avoids wiping votes on echo confirmation)
    const oldMsg = oldIdx >= 0 ? msgs[oldIdx] : undefined;
    const newMsg = (et === 'org.matrix.msc3381.poll.start' && oldMsg)
      ? { ...baseMsg, pollVotes: oldMsg.pollVotes, pollVoters: oldMsg.pollVoters, myVoteAnswerId: oldMsg.myVoteAnswerId, myVoteAnswerIds: oldMsg.myVoteAnswerIds, pollEnded: oldMsg.pollEnded, maxSelections: oldMsg.maxSelections }
      : baseMsg;
    if (oldIdx >= 0) {
      // Replace the temp-ID entry in-place so the message doesn't jump around
      const updated = [...msgs];
      updated[oldIdx] = newMsg;
      subject.next(updated);
    } else {
      // No temp entry found — add if not already present
      if (!msgs.some(m => m.eventId === newMsg.eventId)) {
        subject.next([...msgs, newMsg]);
      }
    }

    // Async-resolve media URL for the confirmed event (local echo has no mediaUrl yet)
    const mxcUrl = newMsg.content?.url ?? newMsg.content?.file?.url;
    if ((newMsg.type === 'm.image' || newMsg.type === 'm.file' || newMsg.type === 'm.audio') && mxcUrl) {
      this.media.resolveMediaUrl(mxcUrl, mediaMimeHint(newMsg)).then(url => {
        if (!url) return;
        const current = subject.value ?? [];
        const idx = current.findIndex(m => m.eventId === newMsg.eventId);
        if (idx >= 0) {
          const patched = [...current];
          patched[idx] = { ...patched[idx], mediaUrl: url };
          subject.next(patched);
        }
      });
    }
  }

  /**
   * Redactions — either mark a message as deleted, or refresh reactions if a reaction
   * was removed.
   */
  public handleRedaction(event: MatrixEvent, room: Room): void {
    const targetId = event.getAssociatedId();
    if (!targetId) return;
    const subject = this.messages$.get(room.roomId);
    if (!subject) return;
    const msgs = subject.value ?? [];

    // If the redacted event itself was a message → mark it deleted
    const msgIdx = msgs.findIndex(m => m.eventId === targetId);
    if (msgIdx >= 0) {
      const updated = [...msgs];
      updated[msgIdx] = { ...msgs[msgIdx], isRedacted: true, body: '' };
      subject.next(updated);
      return;
    }

    // Otherwise the redacted event might be a reaction.
    // m.relates_to is preserved by the Matrix spec after redaction, so try to find the parent.
    const redactedEvent = room.findEventById(targetId);
    const parentId = redactedEvent?.getContent()?.['m.relates_to']?.event_id as string | undefined;
    if (parentId) {
      this.refreshMessageReactions(parentId, room);
    } else {
      // Fallback: refresh reactions on all messages in the room
      const updatedMsgs = msgs.map(m => {
        const ev = room.findEventById(m.eventId);
        return ev ? { ...m, reactions: this.getReactionsForEvent(ev, room) } : m;
      });
      subject.next(updatedMsgs);
    }
  }

  // ---- messages ----

  /**
   * Get messages for a specific room.
   * If the subject was previously created before the client was ready (empty subject,
   * no-op load), retry loading now that the client may be initialized.
   */
  public getMessagesForRoom(roomId: string): Observable<MatrixMessage[] | null> {
    const existing = this.messages$.get(roomId);
    if (!existing) {
      this.messages$.set(roomId, new BehaviorSubject<MatrixMessage[] | null>(null));
      this.loadMessagesForRoom(roomId);
    } else if (this.client && (existing.value === null || this.hasUnloadedHistory(roomId, existing.value))) {
      // C-3: retry when the room was NEVER successfully loaded (value === null, e.g. the
      // subject was created before the client was ready, or a prior load errored). A
      // genuinely empty room has value === [] and must NOT re-paginate on every
      // subscription, which the old `!value?.length` check caused.
      //
      // Blank-room guard: `[]` alone does NOT prove the room is empty. A room whose live timeline was
      // discarded by a `limited` sync (iOS resume) carries state events only until the
      // back-fill runs, and every way that back-fill can come up short — a paginate that
      // throws, the round cap — used to cache `[]` for the rest of the app session: no
      // spinner (that needs `null`), no retry, a permanently blank room the user cannot
      // recover from without restarting the app. An empty list with a backwards pagination
      // token left is one of those cases, so re-load it; a room that really is empty has
      // paginated to its own creation event and has no token, so it still loads once.
      this.loadMessagesForRoom(roomId);
    }
    return this.messages$.get(roomId)!.asObservable();
  }

  /**
   * True when a room's cached message list is empty although the timeline still has history
   * behind it — i.e. the emptiness comes from a back-fill that never reached a message, not
   * from the room being empty. Used to re-load instead of trusting the cached `[]`.
   */
  private hasUnloadedHistory(roomId: string, cached: MatrixMessage[] | null): boolean {
    if (cached === null || cached.length > 0) return false;
    const timeline = this.client?.getRoom(roomId)?.getLiveTimeline();
    return !!timeline?.getPaginationToken(EventTimeline.BACKWARDS);
  }

  /** Number of timeline events that actually render as a message bubble. */
  private countRenderableEvents(events: MatrixEvent[]): number {
    return events.filter(e => isRenderableChatEvent(e.getType(), e.getContent()?.['m.relates_to'])).length;
  }

  /**
   * Load messages for a room from the timeline
   */
  private async loadMessagesForRoom(roomId: string): Promise<void> {
    if (!this.client) return;
    // C-3: guard against overlapping loads for the same room (a second subscription
    // arriving while the first paginate/await is in flight would otherwise double-load).
    if (this.loadingRooms.has(roomId)) return;

    const room = this.client.getRoom(roomId);
    if (!room) {
      console.warn('MatrixMessageService: Room not found:', roomId);
      return;
    }

    this.loadingRooms.add(roomId);
    // Blank-room guard: a back-fill that died on a failed /messages request must not be emitted as an
    // empty room — see emitMessagesFromTimeline's `keepNullWhenEmpty`.
    let paginationFailed = false;
    try {
      const timeline = room.getLiveTimeline();
      const events = timeline.getEvents();

      debugMessage(`MatrixMessageService: Loading messages for room ${roomId}, found ${events.length} events in timeline`, this.appStore.currentUser());

      // Back-fill until the room shows a usable amount of history. Two things are load-bearing
      // here and both used to be wrong:
      //  * count RENDERABLE events, not raw timeline events — group rooms are dominated by
      //    m.room.member (scs Vorstand: 59 member events vs 23 messages), so the old
      //    `events.length < 20` check happily stopped with two visible bubbles;
      //  * loop — one paginate() of 50 is not enough when the window is mostly state events.
      // This runs on room open AND on RoomEvent.TimelineReset (a limited /sync after the app
      // resumes discards the live timeline), which is where the "I only see yesterday" reports
      // come from. Scroll-up pagination stays the path for going further back.
      for (let round = 0; round < MatrixMessageService.MAX_INITIAL_PAGINATIONS; round++) {
        const visible = this.countRenderableEvents(timeline.getEvents());
        if (visible >= MatrixMessageService.MIN_VISIBLE_MESSAGES) break;
        if (!timeline.getPaginationToken(EventTimeline.BACKWARDS)) break; // start of room reached
        debugMessage(`MatrixMessageService: Only ${visible} renderable events, paginating back (round ${round + 1})`, this.appStore.currentUser());
        try {
          const hasMore = await this.client.paginateEventTimeline(timeline, { backwards: true, limit: 50 });
          debugMessage(`MatrixMessageService: After pagination, timeline has ${timeline.getEvents().length} events`, this.appStore.currentUser());
          if (!hasMore) break;
        } catch (paginateError) {
          console.warn('MatrixMessageService: Failed to paginate timeline:', paginateError);
          if (isRoomGoneError(paginateError)) {
            // Not a transient failure: the room only exists in the local store. Evict it
            // instead of caching a blank room the user can never leave (SCS-AD).
            await this.evictGoneRoom(roomId, paginateError);
            return;
          }
          paginationFailed = true;
          this.reportPaginationFailure(paginateError);
          break;
        }
      }

      await this.emitMessagesFromTimeline(room, paginationFailed);
    } catch (error) {
      console.error('MatrixMessageService: Error loading messages for room:', error);
    } finally {
      this.loadingRooms.delete(roomId);
    }
  }

  /**
   * Drop a room the server no longer knows from the local SDK store.
   *
   * A room deleted + purged via the Synapse admin API (e.g. a group room that was re-created)
   * sends no leave event a client that was offline at the time can ever sync — the purge
   * removes the event itself. The IndexedDB store therefore keeps the room as "joined"
   * forever: it shows in the room list, still carries the group's `#group_<key>` alias in its
   * topic, and the group view's local alias match lands on it before ever asking the Cloud
   * Function — which would have returned the live room. Every /messages request against it is
   * a 403 "not in room", i.e. a permanently blank chat (SCS-AD).
   *
   * Eviction is per app session: the SDK's persisted sync accumulator replays the room on the
   * next start (only a synced leave event removes it there), so the first open after a restart
   * hits this path once more and heals again. `forget` is attempted so the server marks it
   * forgotten where it still can; it is best-effort because a purged room has nothing left
   * to forget.
   */
  private async evictGoneRoom(roomId: string, error: unknown): Promise<void> {
    const errcode = (error as MatrixError | null)?.errcode ?? 'unknown';
    console.warn(`MatrixMessageService: Room ${roomId} is gone on the server (${errcode}) — evicting it from the local store`);
    const reason = `stale-room:${errcode}`;
    if (!this.reportedPaginationFailures.has(reason)) {
      this.reportedPaginationFailures.add(reason);
      captureMessage(`MatrixChatService: evicted a room the server no longer knows (${errcode})`, {
        level: 'info',
        tags: { chatTimeline: 'stale-room' },
      });
    }
    // Drop the message subject first so a re-subscription does not re-load the dead room.
    this.messages$.get(roomId)?.complete();
    this.messages$.delete(roomId);
    this.client?.store.removeRoom(roomId);
    // Tell the view BEFORE the room list re-emits: it clears its "deep link already applied"
    // guard, and the following rooms$ emission re-runs the resolution against live rooms.
    this.roomGone$.next(roomId);
    await this.roomList.updateRoomsList();
    try {
      await this.client?.forget(roomId);
    } catch (forgetError) {
      debugMessage(`MatrixMessageService: forget(${roomId}) after eviction failed (expected for a purged room): ${(forgetError as Error)?.message}`, this.appStore.currentUser());
    }
  }

  /**
   * Report a back-pagination that failed while opening a room.
   *
   * This path has no user-facing signal of its own: the room simply shows no messages, and
   * the `console.warn` next to the call dies with the tab (no app installs Sentry's
   * captureConsoleIntegration). Sentry is therefore the only place such a failure can be
   * observed — which is why the blank-DM-on-iOS report arrived with no ticket behind it.
   *
   * Reported once per distinct reason per session, like MatrixMediaService does: one flaky
   * network on a resumed iOS tab hits every room the user opens, and a hundred identical
   * issues would bury the one-off failures this exists to surface. No room id is attached —
   * it identifies a specific private conversation.
   */
  private reportPaginationFailure(error: unknown): void {
    const message = (error as Error | null)?.message ?? 'unknown';
    const errcode = (error as MatrixError | null)?.errcode;
    const reason = errcode ? `${errcode}: ${message}` : message;
    if (this.reportedPaginationFailures.has(reason)) return;
    this.reportedPaginationFailures.add(reason);
    captureMessage(`MatrixChatService: timeline back-pagination failed: ${reason}`, {
      level: 'warning',
      tags: { chatTimeline: 'paginate-failed' },
    });
  }

  /**
   * Load older messages for a room by paginating the live timeline backwards (C-5,
   * scroll-up history). Re-emits the rebuilt message list so all subscribers update.
   * @returns true if more history may be available, false once the start of the room
   * is reached (no backwards pagination token left).
   */
  public async paginateRoomBackwards(roomId: string): Promise<boolean> {
    if (!this.client) return false;
    const room = this.client.getRoom(roomId);
    if (!room) return false;
    const timeline = room.getLiveTimeline();
    if (!timeline.getPaginationToken(EventTimeline.BACKWARDS)) return false;
    // C-3 guard: a load for this room is already in flight — report "maybe more"
    // so the caller can simply retry on the next scroll.
    if (this.loadingRooms.has(roomId)) return true;

    this.loadingRooms.add(roomId);
    try {
      const hasMore = await this.client.paginateEventTimeline(timeline, { backwards: true, limit: 50 });
      await this.emitMessagesFromTimeline(room);
      return hasMore;
    } catch (error) {
      console.warn('MatrixMessageService: Failed to paginate timeline backwards:', error);
      return true; // transient failure — leave the door open for a retry
    } finally {
      this.loadingRooms.delete(roomId);
    }
  }

  /**
   * Rebuild the message list from the room's live timeline (resolving media and
   * avatars) and emit it on the room's messages subject.
   */
  private async emitMessagesFromTimeline(room: Room, keepNullWhenEmpty = false): Promise<void> {
    const roomId = room.roomId;
    const timeline = room.getLiveTimeline();
    // Get all events from timeline and convert to messages, resolving media URLs
    const allEvents = timeline.getEvents();
    const messages = await Promise.all(
      allEvents
        .filter(e => isRenderableChatEvent(e.getType(), e.getContent()?.['m.relates_to']))
        .map(async e => {
          const msg = this.mapEventToMessage(e, room);
          const mxcUrl = msg.content.url ?? msg.content.file?.url;
          const senderMember = room.getMember(e.getSender()!);
          const senderAvatarMxc = (senderMember as any)?.getMxcAvatarUrl?.() as string | undefined;
          const senderAvatar = personAvatarUrl(this.avatarService, e.getSender())
            ?? (senderAvatarMxc ? await this.media.resolveMediaUrl(senderAvatarMxc) : undefined);

          // Attach poll tally and ended flag for poll.start events
          if (e.getType() === 'org.matrix.msc3381.poll.start') {
            const eventId = e.getId()!;
            const { pollVotes, pollVoters, myVoteAnswerId, myVoteAnswerIds } = this.computePollTally(eventId, room);
            await this.resolveVoterAvatars(pollVoters);
            const pollEnded = this.isPollEnded(eventId, room);
            return { ...msg, senderAvatar: senderAvatar || undefined, pollVotes, pollVoters, myVoteAnswerId, myVoteAnswerIds, pollEnded };
          }

          if ((msg.type === 'm.image' || msg.type === 'm.file' || msg.type === 'm.audio') && mxcUrl) {
            return { ...msg, senderAvatar: senderAvatar || undefined, mediaUrl: await this.media.resolveMediaUrl(mxcUrl, mediaMimeHint(msg)) };
          }
          return { ...msg, senderAvatar: senderAvatar || undefined };
        })
    );

    debugMessage(`MatrixMessageService: Loaded ${messages.length} messages for room ${roomId}`, this.appStore.currentUser());

    // Blank-room guard: the back-fill failed AND produced nothing — that is a failed load, not an empty
    // room. Emitting `[]` would cache the failure for the rest of the session (the retry in
    // getMessagesForRoom and the spinner in MatrixChatStore both key off `null`), leaving a
    // room with months of history permanently blank and without any sign that something went
    // wrong. Leave the subject untouched instead: the spinner stays up and the next open of
    // the room loads again.
    if (keepNullWhenEmpty && messages.length === 0) {
      debugMessage(`MatrixMessageService: back-fill for room ${roomId} failed and yielded no messages — keeping the list unresolved for a retry`, this.appStore.currentUser());
      return;
    }

    this.messages$.get(roomId)?.next(messages);
  }

  /**
   * Handle new incoming messages
   */
  private handleNewMessage(event: MatrixEvent, room: Room): void {
    debugData(`MatrixMessageService: New message in room ${room.roomId}`, {
      eventId: event.getId(),
      sender: event.getSender(),
      type: event.getType(),
      content: event.getContent()
    }, this.appStore.currentUser());

    const message = this.mapEventToMessage(event, room);
    const subject = this.messages$.get(room.roomId);

    if (subject) {
      // Deduplicate: the SDK can fire RoomEvent.Timeline more than once for the same event
      // (e.g. soft-failed → retried, or timeline rebuild). Replace if already present.
      const currentMsgs = subject.value ?? [];
      const existing = currentMsgs.findIndex(m => m.eventId === message.eventId);
      if (existing >= 0) {
        const updated = [...currentMsgs];
        updated[existing] = message;
        subject.next(updated);
      } else {
        subject.next([...currentMsgs, message]);
      }
      // Async-resolve media URL and patch the message once fetched
      const mxcUrl = message.content.url ?? message.content.file?.url;
      if ((message.type === 'm.image' || message.type === 'm.file' || message.type === 'm.audio') && mxcUrl) {
        this.media.resolveMediaUrl(mxcUrl, mediaMimeHint(message)).then(url => {
          if (!url) return;
          const msgs = subject.value ?? [];
          const idx = msgs.findIndex(m => m.eventId === message.eventId);
          if (idx >= 0) {
            const updated = [...msgs];
            updated[idx] = { ...updated[idx], mediaUrl: url };
            subject.next(updated);
          }
        });
      }
      // Sender avatar: the tenant's own picture wins, otherwise async-resolve the Matrix
      // profile picture via authenticated fetch.
      const senderMember = room.getMember(event.getSender()!);
      const senderAvatarMxc = (senderMember as any)?.getMxcAvatarUrl?.() as string | undefined;
      const localSenderAvatar = personAvatarUrl(this.avatarService, event.getSender());
      if (localSenderAvatar) {
        this.patchSenderAvatar(subject, message.eventId, localSenderAvatar);
      } else if (senderAvatarMxc) {
        this.media.resolveMediaUrl(senderAvatarMxc).then(url => {
          if (url) this.patchSenderAvatar(subject, message.eventId, url);
        });
      }

      // C-4: replay an edit that arrived before this original message was in the list.
      const bufferedEdit = this.pendingEdits.get(message.eventId);
      if (bufferedEdit) {
        this.pendingEdits.delete(message.eventId);
        this.applyMessageEdit(message.eventId, bufferedEdit, room);
      }
    } else {
      // S4: a not-yet-opened room has no message subject; this is normal operation,
      // not an error. The room-list preview is handled separately via the update trigger.
      debugMessage(`MatrixMessageService: no open message list for room ${room.roomId} — preview only`, this.appStore.currentUser());
    }

    this.roomList.triggerUpdate();
  }

  /** Patch a single message's senderAvatar in place on the room's message subject. */
  private patchSenderAvatar(subject: BehaviorSubject<MatrixMessage[] | null>, eventId: string, senderAvatar: string): void {
    const msgs = subject.value ?? [];
    const idx = msgs.findIndex(m => m.eventId === eventId);
    if (idx < 0) return;
    const updated = [...msgs];
    updated[idx] = { ...updated[idx], senderAvatar };
    subject.next(updated);
  }

  /**
   * Convert a Matrix event to a MatrixMessage
   */
  private mapEventToMessage(event: MatrixEvent, room: Room): MatrixMessage {
    const sender = room.getMember(event.getSender()!);
    const content = event.getContent();
    const relatesTo = content['m.relates_to'];
    const eventType = event.getType();

    let pollAnswers: Array<{ id: string; body: string }> | undefined;
    let maxSelections: number | undefined;
    if (eventType === 'org.matrix.msc3381.poll.start') {
      const rawAnswers = content['org.matrix.msc3381.poll']?.answers;
      if (Array.isArray(rawAnswers)) {
        pollAnswers = rawAnswers.map((a: any) => ({
          id: String(a.id),
          body: a['org.matrix.msc3381.poll.answer']?.body ?? String(a.id)
        }));
      }
      maxSelections = content['org.matrix.msc3381.poll']?.max_selections ?? 1;
    }

    return {
      eventId: event.getId()!,
      roomId: room.roomId,
      sender: event.getSender()!,
      senderName: sender?.name || event.getSender()!,
      senderAvatar: undefined,
      body: content.body || '',
      timestamp: event.getTs(),
      type: content.msgtype ?? eventType,
      content: content,
      relatesTo: (relatesTo?.event_id && relatesTo?.rel_type) ? {
        eventId: relatesTo.event_id as string,
        relationType: relatesTo.rel_type as string
      } : undefined,
      reactions: this.getReactionsForEvent(event, room),
      isRedacted: event.isRedacted(),
      isEdited: !!relatesTo && relatesTo.rel_type === RelationType.Replace,
      pollAnswers,
      maxSelections,
    };
  }

  /** Apply an incoming m.replace edit to the existing message in the BehaviorSubject. */
  private applyMessageEdit(originalEventId: string, editEvent: MatrixEvent, room: Room): void {
    const subject = this.messages$.get(room.roomId);
    if (!subject) return;
    const msgs = subject.value ?? [];
    const idx = msgs.findIndex(m => m.eventId === originalEventId);
    if (idx < 0) {
      // C-4: original not in the list yet — buffer the edit (latest wins) and let
      // handleNewMessage replay it once the original arrives, instead of dropping it.
      this.pendingEdits.set(originalEventId, editEvent);
      return;
    }
    const newContent = editEvent.getContent()?.['m.new_content'];
    if (!newContent) return;
    const updated = [...msgs];
    updated[idx] = {
      ...msgs[idx],
      body: newContent.body ?? msgs[idx].body,
      content: { ...msgs[idx].content, ...newContent },
      isEdited: true,
    };
    subject.next(updated);
  }

  // ---- reactions ----

  /** Read all m.reaction annotation events for a message and group them by emoji key. */
  private getReactionsForEvent(event: MatrixEvent, room: Room): Map<string, Set<string>> | undefined {
    const eventId = event.getId();
    if (!eventId) return undefined;
    const relations = room.relations.getChildEventsForEvent(
      eventId,
      RelationType.Annotation,
      'm.reaction'
    );
    if (!relations) return undefined;
    const reactions = new Map<string, Set<string>>();
    for (const reactionEvent of relations.getRelations()) {
      const key = reactionEvent.getContent()?.['m.relates_to']?.key as string | undefined;
      const sender = reactionEvent.getSender();
      if (key && sender) {
        if (!reactions.has(key)) reactions.set(key, new Set());
        reactions.get(key)!.add(sender);
      }
    }
    return reactions.size > 0 ? reactions : undefined;
  }

  /** Re-map one message in a room's BehaviorSubject after its reactions changed. */
  private refreshMessageReactions(targetEventId: string, room: Room): void {
    const subject = this.messages$.get(room.roomId);
    if (!subject) return;
    const msgs = subject.value ?? [];
    const idx = msgs.findIndex(m => m.eventId === targetEventId);
    if (idx < 0) return;
    const targetEvent = room.findEventById(targetEventId);
    if (!targetEvent) return;
    const updated = [...msgs];
    updated[idx] = { ...msgs[idx], reactions: this.getReactionsForEvent(targetEvent, room) };
    subject.next(updated);
  }

  // ---- polls ----

  /**
   * Tally all poll.response events referencing pollEventId.
   * Deduplicates by sender — only the highest getTs() per sender counts.
   * Returns vote counts per answerId and the current user's voted answerId.
   *
   * C-6: uses the SDK relations API (like reactions) rather than scanning only the live
   * timeline, so votes cast outside the currently-loaded window are still counted.
   */
  private computePollTally(
    pollEventId: string,
    room: Room
  ): {
    pollVotes: Record<string, number>;
    pollVoters: Record<string, MatrixReadReceipt[]>;
    myVoteAnswerId: string | undefined;
    myVoteAnswerIds: string[];
  } {
    const currentUserId = this.getCurrentUserId();
    const latestByUser = new Map<string, { answerIds: string[]; ts: number }>();

    const responses = room.relations.getChildEventsForEvent(
      pollEventId,
      RelationType.Reference,
      'org.matrix.msc3381.poll.response'
    )?.getRelations() ?? [];
    for (const event of responses) {
      const sender = event.getSender();
      if (!sender) continue;
      const answerIds: string[] = event.getContent()?.['org.matrix.msc3381.poll.response']?.answers ?? [];
      if (!answerIds.length) continue;
      const ts = event.getTs();
      const prev = latestByUser.get(sender);
      if (!prev || ts > prev.ts) {
        latestByUser.set(sender, { answerIds, ts });
      }
    }

    const pollVotes: Record<string, number> = {};
    const pollVoters: Record<string, MatrixReadReceipt[]> = {};
    let myVoteAnswerId: string | undefined;
    let myVoteAnswerIds: string[] = [];

    for (const [sender, { answerIds, ts }] of latestByUser) {
      const member = room.getMember(sender);
      const displayName = member?.name ?? sender;
      const mxcAvatarUrl: string | undefined = (member as any)?.getMxcAvatarUrl?.() || undefined;
      // A local avatar is already an https url — resolveVoterAvatars only touches mxc:// ones.
      const avatarUrl = personAvatarUrl(this.avatarService, sender) ?? mxcAvatarUrl;
      const voter: MatrixReadReceipt = { userId: sender, displayName, avatarUrl, ts };
      for (const answerId of answerIds) {
        pollVotes[answerId] = (pollVotes[answerId] ?? 0) + 1;
        if (!pollVoters[answerId]) pollVoters[answerId] = [];
        pollVoters[answerId].push(voter);
      }
      if (sender === currentUserId) {
        myVoteAnswerIds = answerIds;
        myVoteAnswerId = answerIds[0];
      }
    }
    return { pollVotes, pollVoters, myVoteAnswerId, myVoteAnswerIds };
  }

  /**
   * Returns true if a poll.end event referencing pollEventId exists.
   * C-6: uses the relations API so an end event outside the loaded window is still seen.
   */
  private isPollEnded(pollEventId: string, room: Room): boolean {
    const ends = room.relations.getChildEventsForEvent(
      pollEventId,
      RelationType.Reference,
      'org.matrix.msc3381.poll.end'
    )?.getRelations() ?? [];
    return ends.length > 0;
  }

  /** Resolve all mxc:// avatarUrls in pollVoters to authenticated blob URLs in-place. */
  private async resolveVoterAvatars(pollVoters: Record<string, MatrixReadReceipt[]>): Promise<void> {
    const seen = new Set<string>();
    const resolveMap = new Map<string, Promise<string>>();
    for (const voters of Object.values(pollVoters)) {
      for (const voter of voters) {
        if (voter.avatarUrl && voter.avatarUrl.startsWith('mxc://') && !seen.has(voter.avatarUrl)) {
          seen.add(voter.avatarUrl);
          resolveMap.set(voter.avatarUrl, this.media.resolveMediaUrl(voter.avatarUrl));
        }
      }
    }
    await Promise.all(resolveMap.values());
    for (const voters of Object.values(pollVoters)) {
      for (const voter of voters) {
        if (voter.avatarUrl && resolveMap.has(voter.avatarUrl)) {
          voter.avatarUrl = await resolveMap.get(voter.avatarUrl) || undefined;
        }
      }
    }
  }

  /** Re-compute poll tally and update the poll message in the BehaviorSubject. */
  private async refreshPollTally(pollEventId: string, room: Room): Promise<void> {
    const subject = this.messages$.get(room.roomId);
    if (!subject) return;
    const msgs = subject.value ?? [];
    const idx = msgs.findIndex(m => m.eventId === pollEventId);
    if (idx < 0) return;
    const { pollVotes, pollVoters, myVoteAnswerId, myVoteAnswerIds } = this.computePollTally(pollEventId, room);
    await this.resolveVoterAvatars(pollVoters);
    const updated = [...msgs];
    updated[idx] = { ...msgs[idx], pollVotes, pollVoters, myVoteAnswerId, myVoteAnswerIds };
    subject.next(updated);
  }

  /** Mark a poll message as ended in the BehaviorSubject. */
  private markPollEnded(pollEventId: string, room: Room): void {
    const subject = this.messages$.get(room.roomId);
    if (!subject) return;
    const msgs = subject.value ?? [];
    const idx = msgs.findIndex(m => m.eventId === pollEventId);
    if (idx < 0) return;
    const updated = [...msgs];
    updated[idx] = { ...msgs[idx], pollEnded: true };
    subject.next(updated);
  }

  // ---- read receipts ----

  public getReadReceiptsForRoom(roomId: string): Observable<Map<string, MatrixReadReceipt[]>> {
    if (!this.receipts$.has(roomId)) {
      this.receipts$.set(roomId, new BehaviorSubject<Map<string, MatrixReadReceipt[]>>(new Map()));
      const room = this.client?.getRoom(roomId);
      if (room) this.buildAndEmitReceipts(room);
    }
    return this.receipts$.get(roomId)!.asObservable();
  }

  /** Rebuild the read receipts of one room (RoomEvent.Receipt). */
  public refreshReceipts(room: Room): void {
    this.buildAndEmitReceipts(room);
  }

  /** Rebuild the read receipts of every room the user has opened (after PREPARED). */
  public refreshAllReceipts(): void {
    for (const [roomId] of this.receipts$) {
      const room = this.client?.getRoom(roomId);
      if (room) this.buildAndEmitReceipts(room);
    }
  }

  private async buildAndEmitReceipts(room: Room): Promise<void> {
    const currentUserId = this.getCurrentUserId();
    if (!currentUserId || !this.client) return;
    const subject = this.receipts$.get(room.roomId);
    if (!subject) return;

    const result = new Map<string, MatrixReadReceipt[]>();
    for (const member of room.getMembers()) {
      if (member.userId === currentUserId) continue;
      if (isServiceAccount(member.userId)) continue; // hide service/bot accounts (S1)
      if (member.membership !== 'join') continue;
      const receipt = room.getReadReceiptForUserId(member.userId);
      if (!receipt) continue;
      const mxcUrl = (member as any)?.getMxcAvatarUrl?.() as string | undefined;
      // resolveMediaUrl fetches with Authorization header and returns a blob URL,
      // avoiding M_NOT_FOUND from servers with authenticated media enabled.
      const avatarUrl = personAvatarUrl(this.avatarService, member.userId)
        ?? (mxcUrl ? (await this.media.resolveMediaUrl(mxcUrl) || undefined) : undefined);
      const entry: MatrixReadReceipt = {
        userId: member.userId,
        displayName: member.rawDisplayName || member.userId.split(':')[0].substring(1),
        avatarUrl,
        ts: receipt.data.ts,
      };
      const list = result.get(receipt.eventId) ?? [];
      list.push(entry);
      result.set(receipt.eventId, list);
    }
    subject.next(result);
  }
}
