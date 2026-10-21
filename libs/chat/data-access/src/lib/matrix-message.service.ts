import { DestroyRef, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { captureMessage } from '@sentry/angular';
import { ClientEvent, EventTimeline, EventType, MatrixClient, MatrixError, MatrixEvent, RelationType, Room } from 'matrix-js-sdk';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { MatrixMessage, MatrixReadReceipt } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { debugData, debugMessage } from '@okr/shared-util-core';
import {
  EvictedRooms, evictedRoomsStorageKey, evictionAction, isMessageGoneError, isRenderableChatEvent, isRoomGoneError, threadRootOf,
  mediaRetryDelayMs, parseEvictedRooms, parsePollContent, recordEvictedRoom,
} from '@okr/chat-util';
import { AvatarService } from '@okr/avatar-data-access';

import { hasResolvableMedia, isServiceAccount, mediaMimeHint, personAvatarUrl } from './matrix-helpers';
import { MatrixMediaService } from './matrix-media.service';
import { MatrixRoomListService } from './matrix-room-list.service';

/** A room that shows a jumped (non-live) timeline, and how many new messages arrived meanwhile. */
export interface MatrixJumpState {
  roomId: string;
  newCount: number;
}

/**
 * Outcome of a jump (spec 1.104 §4.4): shown ('ok'), deleted or unreadable ('gone'), a
 * transient failure worth a retry ('error'), or a thread reply — those are not in the main
 * list, so the caller opens the thread of `rootId` instead.
 */
export type MatrixJumpResult = 'ok' | 'gone' | 'error' | { kind: 'thread'; rootId: string };

/** How long a jump waits for a room the client does not know yet (just joined via the function). */
const JUMP_ROOM_WAIT_MS = 10_000;

/** Events fetched on each side of a jump target, so it does not land alone on the screen. */
const JUMP_CONTEXT_LIMIT = 25;
/** Safety cap when walking linked timelines — real chains are a handful long. */
const MAX_LINKED_TIMELINES = 100;

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
  /**
   * Rooms whose live timeline was reset WHILE a load was in flight, so the load must run
   * again on the fresh timeline. Without this, `handleTimelineReset` hits the
   * `loadingRooms` guard, returns silently, and the in-flight load emits a message list
   * built from a timeline the SDK has already discarded — see `loadMessagesForRoom`.
   */
  private readonly pendingReload = new Set<string>();
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

  /**
   * The one room that shows a jumped timeline instead of its live one (spec 1.104 §4.4), or
   * undefined. `head` is the newest timeline of the jumped window; the window is `head` plus
   * every timeline linked behind it (see linkedChain). `newEventIds` are the live messages
   * that arrived meanwhile — they are counted, not shown.
   */
  private jump: { roomId: string; head: EventTimeline; newEventIds: Set<string> } | undefined;
  private readonly jumpState$ = new BehaviorSubject<MatrixJumpState | undefined>(undefined);
  /** Bumped on every jump start and end: an emit computed for the other view is stale. */
  private viewSeq = 0;
  /** Bumped on every loadEventContext: only the newest request may still jump. */
  private jumpRequestSeq = 0;
  /** True while a forward pagination of the jumped window is in flight. */
  private paginatingForwards = false;

  /**
   * Attachments whose download failed, eventId → roomId. A failed download used to be
   * dropped silently and the tile read "image unavailable" until the next cold start of the
   * app, because only a full rebuild of the message list resolved media again. Everything
   * listed here is retried: on a back-off timer, when the app returns to the foreground, when
   * the device comes back online, and on a tap on the tile (retryMedia).
   */
  private readonly failedMedia = new Map<string, string>();
  private readonly failedMedia$ = new BehaviorSubject<ReadonlySet<string>>(new Set());
  /** Automatic retries already used per eventId — see mediaRetryDelayMs. */
  private readonly mediaRetryAttempts = new Map<string, number>();
  private readonly mediaRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** How many rendered messages an opened room should carry before back-filling stops. */
  private static readonly MIN_VISIBLE_MESSAGES = 20;
  /** Round cap, so a room made almost entirely of state events cannot spin on /messages. */
  private static readonly MAX_INITIAL_PAGINATIONS = 5;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const document = inject(DOCUMENT);
    const window = document.defaultView;
    // A download cut off by a backgrounded tab or a dropped connection is exactly what these
    // two moments repair — retry everything that is still missing right then.
    const onVisible = () => { if (document.visibilityState === 'visible') this.retryAllFailedMedia(); };
    const onOnline = () => this.retryAllFailedMedia();
    document.addEventListener('visibilitychange', onVisible);
    window?.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisible);
      window?.removeEventListener('online', onOnline);
      this.mediaRetryTimers.forEach(t => clearTimeout(t));
    });
  }

  // ---- lifecycle, driven by the facade ----

  setClient(client: MatrixClient | null): void {
    this.client = client;
  }

  /** Drop the per-session load state (disconnect). Message lists themselves are kept. */
  clearTransient(): void {
    this.receipts$.clear();
    this.loadingRooms.clear();
    this.pendingReload.clear();
    this.pendingEdits.clear();
    this.endJump();
    this.mediaRetryTimers.forEach(t => clearTimeout(t));
    this.mediaRetryTimers.clear();
    this.mediaRetryAttempts.clear();
  }

  /** Event ids of attachments whose download failed — the tile shows the error instead of "loading". */
  get failedMediaIds(): Observable<ReadonlySet<string>> {
    return this.failedMedia$.asObservable();
  }

  /**
   * Retry one attachment now (a tap on its "image unavailable" tile). Does not consume one
   * of the automatic retries.
   */
  public retryMedia(roomId: string, eventId: string): void {
    const subject = this.messages$.get(roomId);
    const message = subject?.value?.find(m => m.eventId === eventId);
    if (!subject || !message) return;
    this.patchResolvedMedia(subject, message);
  }

  /** Retry every attachment that is still missing (foreground, back online). */
  private retryAllFailedMedia(): void {
    for (const [eventId, roomId] of [...this.failedMedia]) this.retryMedia(roomId, eventId);
  }

  /** The room that shows a jumped timeline (spec 1.104 §4.4), undefined while every room is live. */
  get jumpState(): Observable<MatrixJumpState | undefined> {
    return this.jumpState$.asObservable();
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
      const relatesTo = event.getContent()?.['m.relates_to'];
      if (relatesTo?.rel_type === RelationType.Replace && relatesTo?.event_id) {
        this.applyMessageEdit(relatesTo.event_id as string, event, room);
        return;
      }
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
    // A reset that lands DURING a load must not be dropped by the load guard: that load is
    // filling a timeline the SDK just discarded, so its result is the post-gap window alone
    // (on iOS, after a resume: today's messages and nothing else). Remember it instead and
    // let the running load re-run itself against the fresh timeline when it finishes.
    if (this.loadingRooms.has(room.roomId)) {
      this.pendingReload.add(room.roomId);
      return;
    }
    this.loadMessagesForRoom(room.roomId);
  }

  /**
   * When a sent message is confirmed by the server, replace the local-echo entry
   * (temp ID like ~!room:id.$local) with the confirmed event (real server ID).
   */
  /**
   * A room became known to the client (it arrived via sync) or we just joined it. A message list
   * requested BEFORE that moment — e.g. the «Notizen an mich» room opened right after the Cloud
   * Function created and joined it (spec 1.104), or any other CF-joined room — found no room,
   * stayed unloaded (`null`) and was never loaded again, so its history (the first bookmark)
   * stayed invisible until a reload. Load it now. A list that already loaded is left alone.
   */
  public handleRoomArrived(room: Room): void {
    const subject = this.messages$.get(room.roomId);
    if (subject && subject.value === null) void this.loadMessagesForRoom(room.roomId);
  }

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
    // A jumped window shows old messages only; the confirmed message is in the live timeline
    // and appears with it on «Zum neusten».
    if (this.isJumped(room.roomId)) return;
    const msgs = subject.value ?? [];
    const oldIdx = oldEventId ? msgs.findIndex(m => m.eventId === oldEventId) : -1;
    const baseMsg = this.mapEventToMessage(event, room);
    // For poll.start: preserve tally fields from the existing entry (avoids wiping votes on echo confirmation)
    const oldMsg = oldIdx >= 0 ? msgs[oldIdx] : undefined;
    const pollMsg = (et === 'org.matrix.msc3381.poll.start' && oldMsg)
      ? { ...baseMsg, pollVotes: oldMsg.pollVotes, pollVoters: oldMsg.pollVoters, myVoteAnswerId: oldMsg.myVoteAnswerId, myVoteAnswerIds: oldMsg.myVoteAnswerIds, pollEnded: oldMsg.pollEnded, maxSelections: oldMsg.maxSelections }
      : baseMsg;
    // Keep the attachment the temp entry already shows: the confirmed event points at the
    // same file, and dropping it made the sender's own photo flash back to a placeholder.
    const newMsg = withResolvedMedia(pollMsg, oldMsg);
    if (oldEventId && oldEventId !== newMsg.eventId) this.clearMediaFailure(oldEventId);
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
    this.patchResolvedMedia(subject, newMsg);
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
    const room = this.client?.getRoom(roomId);
    return !!room && !!this.linkedChain(room.getLiveTimeline())[0].getPaginationToken(EventTimeline.BACKWARDS);
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
      let timeline = room.getLiveTimeline();
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
        // Re-read the live timeline every round. A `limited` sync arriving mid-load (the
        // normal case when an iOS PWA resumes) makes the SDK call room.resetLiveTimeline(),
        // and the object captured above is then detached: paginating it fills a timeline
        // nobody reads, while emitMessagesFromTimeline re-reads the FRESH one — which holds
        // only the events since the gap. The user is left with today's messages, and because
        // that list is non-empty it is never re-loaded (getMessagesForRoom) and never
        // scrollable (a viewport that does not overflow fires no scroll event), so the room
        // stays that way until the app restarts.
        //
        // After a jump that paginated forwards into the live timeline, the jumped window is
        // linked BEHIND the live timeline and is part of the live list; back-fill from the
        // oldest linked timeline then (see linkedChain). Without a jump the chain is just
        // the live timeline.
        const chain = this.linkedChain(room.getLiveTimeline());
        timeline = chain[0];
        const visible = this.countRenderableEvents(chain.flatMap(t => t.getEvents()));
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
      // A timeline reset arrived while this load was running — redo it against the fresh
      // timeline. Cheap when the back-fill already reached the target: the loop's first
      // check breaks immediately and no /messages request is made.
      if (this.pendingReload.delete(roomId)) {
        debugMessage(`MatrixMessageService: re-loading room ${roomId} after a timeline reset during the load`, this.appStore.currentUser());
        void this.loadMessagesForRoom(roomId);
      }
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
   * `removeRoom` only clears the in-memory store: the SDK's persisted sync accumulator replays
   * the room on the next start (only a synced leave event removes it there). The eviction is
   * therefore also recorded in localStorage and re-applied by {@link evictPersistedGoneRooms}
   * at PREPARED, so each dead room costs one 403 per device instead of one per app start
   * (SCS-AS). `forget` is attempted so the server marks it forgotten where it still can; it
   * is best-effort because a purged room has nothing left to forget.
   */
  private async evictGoneRoom(roomId: string, error: unknown): Promise<void> {
    const errcode = (error as MatrixError | null)?.errcode ?? 'unknown';
    console.warn(`MatrixMessageService: Room ${roomId} is gone on the server (${errcode}) — evicting it from the local store`);
    this.writeEvictedRooms(recordEvictedRoom(this.readEvictedRooms(), roomId, Date.now()));
    const reason = `stale-room:${errcode}`;
    if (!this.reportedPaginationFailures.has(reason)) {
      this.reportedPaginationFailures.add(reason);
      captureMessage(`MatrixChatService: evicted a room the server no longer knows (${errcode})`, {
        level: 'info',
        tags: { chatTimeline: 'stale-room' },
      });
    }
    if (this.isJumped(roomId)) this.endJump();
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
   * Re-apply the evictions recorded by {@link evictGoneRoom} in earlier sessions. Called at
   * PREPARED, before the first room list is built, because the sync accumulator has just
   * replayed those rooms as joined.
   *
   * Runs on EVERY PREPARED — with a cached sync the SDK emits it twice (after the cache
   * replay, then after the first server /sync). A room the store does not hold is therefore
   * kept in the record, never dropped: the persisted sync accumulator replays it again on the
   * next start. A room whose own membership event is newer than the eviction was re-invited
   * or re-joined and is released again. Everything else is removed from the store without another
   * /messages round-trip and without another Sentry event.
   */
  evictPersistedGoneRooms(): void {
    const client = this.client;
    const userId = client?.getUserId();
    if (!client || !userId) return;
    const evicted = this.readEvictedRooms();
    const remaining: EvictedRooms = {};
    for (const [roomId, evictedAt] of Object.entries(evicted)) {
      const room = client.getRoom(roomId);
      const action = evictionAction(evictedAt, !!room, room?.getMember(userId)?.events.member?.getTs());
      if (action === 'release') {
        debugMessage(`MatrixMessageService: ${roomId} has a membership newer than its eviction — keeping it`, this.appStore.currentUser());
        continue;
      }
      remaining[roomId] = evictedAt;
      if (action === 'keep') continue;
      this.messages$.get(roomId)?.complete();
      this.messages$.delete(roomId);
      client.store.removeRoom(roomId);
      debugMessage(`MatrixMessageService: re-evicted ${roomId} replayed by the sync store`, this.appStore.currentUser());
    }
    if (Object.keys(remaining).length !== Object.keys(evicted).length) this.writeEvictedRooms(remaining);
  }

  private evictedRoomsKey(): string | undefined {
    const userId = this.client?.getUserId();
    return userId ? evictedRoomsStorageKey(userId) : undefined;
  }

  private readEvictedRooms(): EvictedRooms {
    const key = this.evictedRoomsKey();
    if (!key) return {};
    try {
      return parseEvictedRooms(localStorage.getItem(key));
    } catch {
      return {};
    }
  }

  private writeEvictedRooms(rooms: EvictedRooms): void {
    const key = this.evictedRoomsKey();
    if (!key) return;
    try {
      if (Object.keys(rooms).length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(rooms));
    } catch {
      // Storage blocked (private mode, quota): the in-session eviction still works.
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
   * Load older messages for a room by paginating the shown timeline backwards (C-5,
   * scroll-up history): the oldest timeline linked behind the live one, or behind the
   * jumped window while one is shown. Re-emits the rebuilt message list so all subscribers
   * update.
   * @returns true if more history may be available, false once the start of the room
   * is reached (no backwards pagination token left).
   */
  public async paginateRoomBackwards(roomId: string): Promise<boolean> {
    if (!this.client) return false;
    const room = this.client.getRoom(roomId);
    if (!room) return false;
    const timeline = this.linkedChain(this.shownHead(room))[0];
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

  // ---- jump to a message (spec 1.104 §4.4) ----

  /** Whether the room shows a jumped window instead of its live timeline. */
  public isJumped(roomId: string): boolean {
    return this.jump?.roomId === roomId;
  }

  /**
   * Show the room at one message, however old: load the event's context with
   * `getEventTimeline` (one /context request) instead of paginating the live timeline back in
   * steps of 50, fill a screenful on both sides, and emit that window on the room's messages
   * subject. Live messages arriving meanwhile are counted, not shown (handleNewMessage).
   *
   * An event the live list already holds needs no jump: the room simply stays live.
   *
   * @returns 'gone' when the event was deleted, cannot be read (no longer in the room, unknown
   * id) or the room stays unknown; 'error' for a transient failure; a thread result for a
   * thread reply. The room then stays on its live timeline. 'ok' otherwise — also when a
   * newer request superseded this one while it loaded.
   */
  public async loadEventContext(roomId: string, eventId: string): Promise<MatrixJumpResult> {
    const client = this.client;
    if (!client) return 'error';
    const seq = ++this.jumpRequestSeq;
    const room = await this.waitForRoom(client, roomId);
    if (seq !== this.jumpRequestSeq) return 'ok';
    if (!room) return 'gone';

    let timeline: EventTimeline | null;
    try {
      // Returns the timeline already holding the event, else builds a new one from /context.
      // Throws on M_NOT_FOUND / M_FORBIDDEN (deleted for good, or we left the room); null for
      // an event inside a thread.
      timeline = await client.getEventTimeline(room.getUnfilteredTimelineSet(), eventId);
    } catch (error) {
      console.warn('MatrixMessageService.loadEventContext: event context not available:', error);
      return isMessageGoneError(error) ? 'gone' : 'error';
    }
    if (seq !== this.jumpRequestSeq) return 'ok';
    const event = timeline?.getEvents().find(e => e.getId() === eventId);
    if (event?.isRedacted()) return 'gone';
    // A thread reply: the main list filters it out, so open its thread. With threads off in
    // the client a reply sits in the main timeline (found above); getEventTimeline refuses one
    // it has to fetch (null), so ask for the bare event then.
    const rootId = event ? threadRootOf(event.getContent()) : undefined;
    if (rootId) return { kind: 'thread', rootId };
    if (!timeline || !event) return this.classifyMissingEvent(client, roomId, eventId);

    // Already on the live list (recent message, or a window that an earlier jump linked to
    // the live timeline): no jump. Leave a jumped window of any room first.
    if (this.linkedChain(room.getLiveTimeline()).includes(timeline)) {
      if (this.jump) this.returnToLive(this.jump.roomId);
      return 'ok';
    }
    // Already inside the jumped window of this room: just scroll there.
    if (this.jump?.roomId === roomId && this.linkedChain(this.jump.head).includes(timeline)) return 'ok';

    // A context request returns the target alone: fetch some history on both sides. A failure
    // here still leaves the target itself to show.
    try {
      await Promise.all([
        client.paginateEventTimeline(timeline, { backwards: true, limit: JUMP_CONTEXT_LIMIT }),
        client.paginateEventTimeline(timeline, { backwards: false, limit: JUMP_CONTEXT_LIMIT }),
      ]);
    } catch (error) {
      console.warn('MatrixMessageService.loadEventContext: filling the context failed:', error);
    }
    if (seq !== this.jumpRequestSeq) return 'ok';

    // Only one room is jumped at a time: leaving another jumped room returns it to live.
    if (this.jump && this.jump.roomId !== roomId) this.returnToLive(this.jump.roomId);
    const head = this.advanceHead(room, timeline);
    if (head === 'live') {
      // The forward fill already reached the live timeline: the window is part of the live list.
      if (this.jump) this.returnToLive(roomId);
      else void this.emitMessagesFromTimeline(room);
      return 'ok';
    }

    if (!this.messages$.has(roomId)) this.messages$.set(roomId, new BehaviorSubject<MatrixMessage[] | null>(null));
    this.jump = { roomId, head, newEventIds: new Set() };
    this.viewSeq++;
    this.publishJumpState();
    debugMessage(`MatrixMessageService: jumped to an event in room ${roomId}`, this.appStore.currentUser());
    await this.emitMessagesFromTimeline(room);
    return 'ok';
  }

  /** The room, waiting up to JUMP_ROOM_WAIT_MS for it to arrive (a room the function just joined). */
  private waitForRoom(client: MatrixClient, roomId: string): Promise<Room | null> {
    const known = client.getRoom(roomId);
    if (known) return Promise.resolve(known);
    return new Promise(resolve => {
      const onRoom = (room: Room) => {
        if (room.roomId !== roomId) return;
        done(room);
      };
      const timer = setTimeout(() => done(client.getRoom(roomId)), JUMP_ROOM_WAIT_MS);
      const done = (room: Room | null) => {
        clearTimeout(timer);
        client.off(ClientEvent.Room, onRoom);
        resolve(room);
      };
      client.on(ClientEvent.Room, onRoom);
    });
  }

  /**
   * The event did not come back as part of a timeline: fetch it alone to tell a thread reply
   * (open the thread) from a deleted one ('gone') and from a transient failure ('error').
   */
  private async classifyMissingEvent(client: MatrixClient, roomId: string, eventId: string): Promise<MatrixJumpResult> {
    try {
      const raw = await client.fetchRoomEvent(roomId, eventId);
      if (raw.unsigned?.redacted_because) return 'gone';
      const rootId = threadRootOf(raw.content as Record<string, unknown> | undefined);
      return rootId ? { kind: 'thread', rootId } : 'gone';
    } catch (error) {
      console.warn('MatrixMessageService.loadEventContext: event not available:', error);
      return isMessageGoneError(error) ? 'gone' : 'error';
    }
  }

  /**
   * Load newer messages into the jumped window (scrolling down). Once the window reaches the
   * live timeline the room switches back to live: the SDK links the window behind the live
   * timeline, so the live list then simply continues the window and the viewport stays put.
   * @returns true while the jumped window may still grow, false once the room is live again.
   */
  public async paginateForwards(roomId: string): Promise<boolean> {
    const client = this.client;
    const jump = this.jump;
    const room = client?.getRoom(roomId);
    if (!client || !room || jump?.roomId !== roomId) return false;
    if (this.paginatingForwards) return true;
    this.paginatingForwards = true;
    try {
      let more = true;
      let head = this.advanceHead(room, jump.head);
      if (head !== 'live') {
        more = await client.paginateEventTimeline(head, { backwards: false, limit: 50 });
        if (this.jump !== jump) return false;
        head = this.advanceHead(room, head);
      }
      // `more` false without a link: the window reached the present without ever overlapping
      // the live timeline (a quiet room). The live list is the right view then too.
      if (head === 'live' || !more) {
        this.returnToLive(roomId);
        return false;
      }
      jump.head = head;
      await this.emitMessagesFromTimeline(room);
      return true;
    } catch (error) {
      console.warn('MatrixMessageService.paginateForwards: failed:', error);
      return true; // transient — the next scroll retries
    } finally {
      this.paginatingForwards = false;
    }
  }

  /**
   * Leave the jumped window and show the live timeline again («Zum neusten», or the window
   * reached the live end). Reloads the live list through the regular load, which also
   * catches up with a timeline reset that happened meanwhile.
   */
  public returnToLive(roomId: string, reload = true): void {
    if (this.jump?.roomId !== roomId) return;
    this.endJump();
    if (!reload) {
      // A room being left: no reload against a room we are leaving, but forget the jumped
      // list, so a later open (after a rejoin) loads the live timeline afresh.
      this.messages$.get(roomId)?.next(null);
      return;
    }
    if (this.loadingRooms.has(roomId)) this.pendingReload.add(roomId);
    else void this.loadMessagesForRoom(roomId);
  }

  private endJump(): void {
    if (!this.jump) return;
    this.jump = undefined;
    this.viewSeq++;
    this.paginatingForwards = false;
    this.publishJumpState();
  }

  private publishJumpState(): void {
    const jump = this.jump;
    this.jumpState$.next(jump ? { roomId: jump.roomId, newCount: jump.newEventIds.size } : undefined);
  }

  /** The newest timeline the room shows: the jumped window's head, else the live timeline. */
  private shownHead(room: Room): EventTimeline {
    return this.jump?.roomId === room.roomId ? this.jump.head : room.getLiveTimeline();
  }

  /**
   * `head` and every timeline linked behind it, oldest first. The SDK links two timelines
   * when a pagination of one runs into events of the other. Without a jump the live
   * timeline has no backwards neighbour, so this is `[live]` and rooms that never jumped
   * behave exactly as before.
   */
  private linkedChain(head: EventTimeline): EventTimeline[] {
    const chain = [head];
    let t = head.getNeighbouringTimeline(EventTimeline.BACKWARDS);
    while (t && chain.length < MAX_LINKED_TIMELINES && !chain.includes(t)) {
      chain.unshift(t);
      t = t.getNeighbouringTimeline(EventTimeline.BACKWARDS);
    }
    return chain;
  }

  /**
   * Follow the forward links from `timeline`: 'live' when they lead into the live timeline,
   * otherwise the newest non-live timeline reached.
   */
  private advanceHead(room: Room, timeline: EventTimeline): EventTimeline | 'live' {
    const live = room.getLiveTimeline();
    let head = timeline;
    for (let i = 0; i < MAX_LINKED_TIMELINES; i++) {
      if (head === live) return 'live';
      const next = head.getNeighbouringTimeline(EventTimeline.FORWARDS);
      if (!next) return head;
      head = next;
    }
    return head;
  }

  /**
   * Rebuild the message list from the timeline the room shows — the live timeline, or the
   * jumped window while one is shown — resolving media and avatars, and emit it on the
   * room's messages subject. Both include the timelines linked behind them (linkedChain).
   */
  private async emitMessagesFromTimeline(room: Room, keepNullWhenEmpty = false): Promise<void> {
    const roomId = room.roomId;
    const seq = this.viewSeq;
    const allEvents = this.linkedChain(this.shownHead(room)).flatMap(t => t.getEvents());
    const messages = await this.buildMessages(room, allEvents);

    // A jump started or ended while media resolved: this list belongs to the other view,
    // and the switch emits its own.
    if (seq !== this.viewSeq) return;

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

  /** Map timeline events to the renderable messages, with media, avatars and poll tallies resolved. */
  private async buildMessages(room: Room, allEvents: MatrixEvent[]): Promise<MatrixMessage[]> {
    const roomId = room.roomId;
    return Promise.all(
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

          if (hasResolvableMedia(msg.type) && mxcUrl) {
            const [mediaUrl, posterUrl] = await Promise.all([
              this.resolveDisplayUrl(msg, mxcUrl),
              this.resolvePosterUrl(msg),
            ]);
            this.recordMediaOutcome(roomId, msg.eventId, !!mediaUrl);
            return { ...msg, senderAvatar: senderAvatar || undefined, mediaUrl: mediaUrl || undefined, posterUrl };
          }
          return { ...msg, senderAvatar: senderAvatar || undefined };
        })
    );
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

    if (this.jump?.roomId === room.roomId) {
      // A jumped window is on screen: the new message is not shown, only counted on
      // «Zum neusten». The live timeline holds it; returnToLive rebuilds the list from there.
      if (!this.jump.newEventIds.has(message.eventId)) {
        this.jump.newEventIds.add(message.eventId);
        this.publishJumpState();
      }
    } else if (subject) {
      // Deduplicate: the SDK can fire RoomEvent.Timeline more than once for the same event
      // (e.g. soft-failed → retried, or timeline rebuild). Replace if already present.
      const currentMsgs = subject.value ?? [];
      const existing = currentMsgs.findIndex(m => m.eventId === message.eventId);
      if (existing >= 0) {
        const updated = [...currentMsgs];
        updated[existing] = withResolvedMedia(message, currentMsgs[existing]);
        subject.next(updated);
      } else {
        subject.next([...currentMsgs, message]);
      }
      // Async-resolve media URL and patch the message once fetched
      this.patchResolvedMedia(subject, message);
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
  /**
   * Resolve a message's attachment — and, for a video, its poster frame — from `mxc://`
   * to a URL the browser can load, then patch the already-emitted message in place.
   *
   * Both URLs are fetched together and written in a SINGLE patch on purpose: two separate
   * patches read `subject.value` at different times, so the slower one would write back a
   * copy of the message that predates the faster one and silently drop its field.
   */
  private patchResolvedMedia(subject: BehaviorSubject<MatrixMessage[] | null>, message: MatrixMessage): void {
    const mxcUrl = message.content?.url ?? message.content?.file?.url;
    if (!hasResolvableMedia(message.type) || !mxcUrl) return;

    void Promise.all([
      this.resolveDisplayUrl(message, mxcUrl),
      this.resolvePosterUrl(message),
    ]).then(([mediaUrl, posterUrl]) => {
      const msgs = subject.value ?? [];
      // The entry may have been replaced meanwhile (local echo confirmed under its real id);
      // the replacement resolves its own media, so this outcome no longer belongs to anything.
      if (!msgs.some(m => m.eventId === message.eventId)) return;
      this.recordMediaOutcome(message.roomId, message.eventId, !!mediaUrl);
      if (!mediaUrl && !posterUrl) return;
      const idx = msgs.findIndex(m => m.eventId === message.eventId);
      if (idx < 0) return;
      const updated = [...msgs];
      updated[idx] = {
        ...updated[idx],
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(posterUrl ? { posterUrl } : {}),
      };
      subject.next(updated);
    });
  }

  /**
   * The URL to show an attachment in the list: the server's scaled preview for a large photo,
   * the original for everything else — see MatrixMediaService.resolvePreviewUrl. The original
   * of a photo is only fetched when it is opened (MatrixChatService.resolveMediaUrl).
   */
  private resolveDisplayUrl(message: MatrixMessage, mxcUrl: string): Promise<string> {
    const hint = mediaMimeHint(message);
    if (message.type !== 'm.image') return this.media.resolveMediaUrl(mxcUrl, hint);
    const size = message.content?.info?.size;
    return this.media.resolvePreviewUrl(mxcUrl, hint, typeof size === 'number' ? size : undefined);
  }

  /** Track a download's outcome: a success clears a failure, a failure is scheduled for retry. */
  private recordMediaOutcome(roomId: string, eventId: string, ok: boolean): void {
    if (ok) {
      this.clearMediaFailure(eventId);
      return;
    }
    if (!this.failedMedia.has(eventId)) {
      this.failedMedia.set(eventId, roomId);
      this.failedMedia$.next(new Set(this.failedMedia.keys()));
    }
    if (this.mediaRetryTimers.has(eventId)) return;
    const attempt = this.mediaRetryAttempts.get(eventId) ?? 0;
    const delay = mediaRetryDelayMs(attempt);
    if (delay === undefined) return; // automatic retries used up — foreground, online or a tap
    this.mediaRetryAttempts.set(eventId, attempt + 1);
    this.mediaRetryTimers.set(eventId, setTimeout(() => {
      this.mediaRetryTimers.delete(eventId);
      if (this.failedMedia.has(eventId)) this.retryMedia(roomId, eventId);
    }, delay));
  }

  private clearMediaFailure(eventId: string): void {
    const timer = this.mediaRetryTimers.get(eventId);
    if (timer) clearTimeout(timer);
    this.mediaRetryTimers.delete(eventId);
    this.mediaRetryAttempts.delete(eventId);
    if (this.failedMedia.delete(eventId)) this.failedMedia$.next(new Set(this.failedMedia.keys()));
  }

  /**
   * The loadable URL of a video's thumbnail, or undefined when the event carries none —
   * which is the normal case for a video sent by a client that could not decode it, and
   * for every video sent before this app knew about `m.video`.
   */
  private async resolvePosterUrl(message: MatrixMessage): Promise<string | undefined> {
    const thumbnailMxc = message.content?.info?.thumbnail_url as string | undefined;
    if (!thumbnailMxc) return undefined;
    return await this.media.resolveMediaUrl(thumbnailMxc, 'image/jpeg') || undefined;
  }

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
      ({ answers: pollAnswers, maxSelections } = parsePollContent(content));
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
    const content = { ...msgs[idx].content, ...newContent };
    // A poll edit may change answers and single/multiple choice — re-derive both from the
    // new content; the tally stays, because answer ids survive an edit.
    const pollFields = msgs[idx].type === 'org.matrix.msc3381.poll.start'
      ? (({ answers, maxSelections }) => ({ pollAnswers: answers, maxSelections }))(parsePollContent(content))
      : {};
    updated[idx] = {
      ...msgs[idx],
      ...pollFields,
      body: newContent.body ?? msgs[idx].body,
      content,
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

  /** Who reacted to a message with `emoji`, newest first. Redacted reactions are skipped. */
  getReactionDetails(roomId: string, eventId: string, emoji: string): { userId: string; ts: number; eventId: string }[] {
    const room = this.client?.getRoom(roomId);
    if (!room) return [];
    const relations = room.relations.getChildEventsForEvent(eventId, RelationType.Annotation, 'm.reaction');
    if (!relations) return [];
    const result: { userId: string; ts: number; eventId: string }[] = [];
    for (const reactionEvent of relations.getRelations()) {
      if (reactionEvent.isRedacted()) continue;
      const key = reactionEvent.getContent()?.['m.relates_to']?.key as string | undefined;
      const userId = reactionEvent.getSender();
      const id = reactionEvent.getId();
      if (key === emoji && userId && id) result.push({ userId, ts: reactionEvent.getTs(), eventId: id });
    }
    return result.sort((a, b) => b.ts - a.ts);
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
      // An EMPTY answer list is a valid response, not a malformed one: MSC3381 calls it a
      // spoiled vote, and it is exactly what the client sends when somebody unticks their
      // last remaining selection. Skipping it here left the previous, non-empty response as
      // the sender's latest — so the tick reappeared and a vote could never be withdrawn,
      // only changed. It must supersede like any other response; the counting loop below
      // then contributes nothing for it.
      const answerIds: string[] = event.getContent()?.['org.matrix.msc3381.poll.response']?.answers ?? [];
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

/**
 * `next` with the attachment URLs of `previous` carried over, when both entries point at the
 * same file. Rebuilding a message from its event (local-echo confirmation, a re-fired timeline
 * event) otherwise drops the already resolved URL and the tile falls back to its placeholder
 * until the download runs again.
 */
function withResolvedMedia(next: MatrixMessage, previous: MatrixMessage | undefined): MatrixMessage {
  if (!previous || next.mediaUrl) return next;
  const nextMxc = next.content?.url ?? next.content?.file?.url;
  const prevMxc = previous.content?.url ?? previous.content?.file?.url;
  if (!nextMxc || nextMxc !== prevMxc) return next;
  return { ...next, mediaUrl: previous.mediaUrl, posterUrl: next.posterUrl ?? previous.posterUrl };
}
