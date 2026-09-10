import { effect, inject, Injectable } from '@angular/core';
import { createClient, IndexedDBStore, MatrixClient, MatrixEvent, Room, RoomMember, EventType, EventTimeline, MsgType, RelationType, IContent, ISendEventResponse, MatrixError, RoomStateEvent, RoomEvent, ClientEvent, ICreateRoomOpts, Visibility, Preset, User, ReceiptType, type MatrixCall, type Store } from 'matrix-js-sdk';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { MatrixConfig, MatrixMessage, MatrixReadReceipt, MatrixRoom, TypingNotification, UserModel } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { debugData, debugMessage } from '@okr/shared-util-core';
import { convertHeicToJpeg, materializeFile, resolveFileMimeType, extractVideoPoster, initMatrixLogLevel, ensurePromiseWithResolvers, buildMentionContent, escapeHtml, MentionRef, OKR_TENANT_EVENT, resolveMatrixDisplayName, canPostWithPower } from '@okr/chat-util';

import { mxcAvatarHttpUrl } from './matrix-helpers';
import { MatrixMediaService } from './matrix-media.service';
import { MatrixCallService } from './matrix-call.service';
import { MatrixDirectRoomService } from './matrix-direct-room.service';
import { MatrixRoomListService } from './matrix-room-list.service';
import { MatrixMessageService } from './matrix-message.service';

/**
 * SCS-92: refresh a Matrix access token this long before it lapses, so a session that
 * starts just under the wire doesn't die mid-use. The token lives 7 days (see the
 * `getMatrixCredentials` Cloud Function), so one day of slack is cheap.
 */
const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

/** Minimum gap between two media-401-driven re-authentications (SCS-92). */
const MEDIA_AUTH_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

export interface MatrixPollData {
  question: string;
  answers: string[];   // min 2, max 20
  maxSelections?: number; // 1 = single choice (default), >1 = multiple choice
}

/**
 * The `msgtype` an attachment must be sent as. Three-way, and the video branch is the
 * reason this is a named function: everything that is not an image used to be `m.file`,
 * which uploaded videos correctly but told every client — ours and Element alike — to
 * draw a document card instead of a player.
 */
function msgTypeForMimeType(mimetype: string): MsgType {
  if (mimetype.startsWith('image/')) return MsgType.Image;
  if (mimetype.startsWith('video/')) return MsgType.Video;
  return MsgType.File;
}

@Injectable({
  providedIn: 'root'
})
export class MatrixChatService {
  private appStore = inject(AppStore);

  private client: MatrixClient | null = null;
  // ARCH-1: promise-cached so concurrent callers (early-init service + chat component)
  // share one in-flight initialization instead of each minting a Matrix token.
  private initPromise: Promise<void> | null = null;
  // C-9: single source of truth for "is the Matrix client up". The store derives its
  // isMatrixInitialized signal from this instead of maintaining its own copy.
  private readonly isInitialized$ = new BehaviorSubject<boolean>(false);
  private syncState$ = new BehaviorSubject<string>('STOPPED');
  private errors$ = new Subject<MatrixError>();
  private readonly tokenExpired$ = new Subject<void>();
  private readonly roomListToggle$ = new Subject<void>();
  // Bumped on every RoomStateEvent.Events (membership, power levels). The `rooms`
  // observable's distinctUntilChanged deliberately ignores membership (members is
  // hard-coded []), so consumers that need to react to room-state changes (e.g.
  // mention-candidate lists) must depend on this counter instead of `rooms`.
  private readonly roomStateVersion$ = new BehaviorSubject<number>(0);
  // Bound once so add/removeEventListener see the same reference (see setupEventHandlers).
  private readonly kickSync = (): void => {
    if (document.visibilityState !== 'visible') return;
    this.client?.retryImmediately();
  };

  // ARCH-2 delegates (design review #4): this class is the facade. It owns the client,
  // its credentials, the SDK event wiring and everything that SENDS; each delegate owns
  // one slice of read state and is handed the live client on initialize/disconnect.
  private readonly media = inject(MatrixMediaService);
  /** Epoch ms of the last media-401-driven re-auth — see the constructor's cooldown. */
  private lastMediaAuthRecovery = 0;
  private readonly calls = inject(MatrixCallService);
  private readonly dm = inject(MatrixDirectRoomService);
  private readonly roomList = inject(MatrixRoomListService);
  private readonly messages = inject(MatrixMessageService);

  constructor() {
    // Disconnect and clear rooms when the user logs out (fbUser becomes null).
    effect(() => {
      const fbUser = this.appStore.fbUser();
      if (!fbUser && this.client) {
        this.disconnect(true); // logout: wipe the cache so accounts can't mix
      }
    });

    // SCS-92: an authenticated media download that comes back 401 means the access token
    // is dead. Media is fetched outside the SDK, so this fires while the cached timeline
    // renders — before the sync loop reaches ERROR/STOPPED with M_UNKNOWN_TOKEN. Route it
    // into the same recovery: drop the credentials and let the chat component re-auth.
    this.media.authFailed.subscribe(() => {
      if (!this.client) return;
      // Cooldown: if the freshly minted token is rejected too (homeserver trouble rather
      // than expiry), don't spin re-auth → 401 → re-auth against the CF's rate limit.
      const now = Date.now();
      if (now - this.lastMediaAuthRecovery < MEDIA_AUTH_RECOVERY_COOLDOWN_MS) return;
      this.lastMediaAuthRecovery = now;
      console.warn('MatrixChatService: media download rejected (401) — clearing credentials');
      this.clearStoredCredentials();
      this.tokenExpired$.next();
    });
  }

  get isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Reactive mirror of {@link isInitialized}: emits true once the client is up,
   * false after disconnect. C-9 — the store's `isMatrixInitialized` signal is derived
   * from this single source instead of being written from two code paths.
   */
  get initialized(): Observable<boolean> {
    return this.isInitialized$.asObservable().pipe(distinctUntilChanged());
  }

  get syncState(): Observable<string> {
    return this.syncState$.asObservable().pipe(distinctUntilChanged());
  }

  /** Emits true once the room list reflects the initial sync; false again after disconnect. */
  get roomsLoaded(): Observable<boolean> {
    return this.roomList.roomsLoaded;
  }

  get rooms(): Observable<MatrixRoom[]> {
    return this.roomList.rooms;
  }

  /** Synchronous snapshot of the current rooms list (BehaviorSubject value). */
  get roomsCurrentValue(): MatrixRoom[] {
    return this.roomList.roomsCurrentValue;
  }

  /**
   * Increments on every room-state event (membership, power levels). Exists so
   * consumers can recompute room-state-derived values (e.g. mention candidates,
   * @room notification permission) that the `rooms` observable deliberately
   * filters out via its distinctUntilChanged comparator (members is hard-coded
   * `[]` there, so joins/leaves in a named room never change a compared field).
   */
  get roomStateVersion(): Observable<number> {
    return this.roomStateVersion$.asObservable();
  }

  // ---- Credential storage helpers ----

  getStoredCredentials(): MatrixConfig | null {
    const accessToken = localStorage.getItem('matrix_access_token');
    const userId = localStorage.getItem('matrix_user_id');
    if (!accessToken || !userId) return null;
    let homeserverUrl = localStorage.getItem('matrix_homeserver') || '';
    if (homeserverUrl && !homeserverUrl.startsWith('https://')) homeserverUrl = 'https://' + homeserverUrl;
    const expiresAt = Number(localStorage.getItem('matrix_token_expires_at'));
    return {
      accessToken,
      userId,
      deviceId: localStorage.getItem('matrix_device_id') || '',
      homeserverUrl,
      ...(Number.isFinite(expiresAt) && expiresAt > 0 ? { expiresAt } : {}),
    };
  }

  storeCredentials(credentials: MatrixConfig): void {
    if (credentials.accessToken) localStorage.setItem('matrix_access_token', credentials.accessToken);
    if (credentials.userId) localStorage.setItem('matrix_user_id', credentials.userId);
    if (credentials.deviceId) localStorage.setItem('matrix_device_id', credentials.deviceId);
    if (credentials.homeserverUrl) localStorage.setItem('matrix_homeserver', credentials.homeserverUrl);
    if (credentials.expiresAt) localStorage.setItem('matrix_token_expires_at', String(credentials.expiresAt));
    else localStorage.removeItem('matrix_token_expires_at');
  }

  /**
   * SCS-92: a stored token is only reusable while it is comfortably inside its lifetime.
   * The Cloud Function mints tokens with a hard `valid_until_ms`; once that passes,
   * Synapse answers 401 on every request and the app has no way to notice until
   * something fails. Credentials without an `expiresAt` predate that field and are
   * treated as expired, so the fleet heals on the next chat open.
   */
  private isTokenUsable(credentials: MatrixConfig): boolean {
    return !!credentials.expiresAt && credentials.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now();
  }

  clearStoredCredentials(): void {
    // Keep in sync with the matrix key list cleared on logout in AuthService (M-2).
    // matrix_login_token is obsolete (OIDC bridge removed, C-3) but cleared
    // defensively to purge stale values from older browser sessions.
    [
      'matrix_access_token', 'matrix_user_id', 'matrix_device_id', 'matrix_homeserver',
      'matrix_token_expires_at', 'matrix_avatar_firebase_url', 'matrix_avatar_mxc_url',
      'matrix_login_token',
    ].forEach(key => localStorage.removeItem(key));
  }

  /**
   * Resolve Matrix credentials for the current user: reuse a valid cached token, else
   * fetch a fresh one from the `getMatrixCredentials` Cloud Function. Cached credentials
   * are discarded when they reference a different Matrix user id (e.g. stale UID-based
   * ids from before the personKey scheme).
   *
   * ARCH-1 / SEC-4: this is the SINGLE credential-fetch path. It replaces the former
   * near-duplicate implementations in `MatrixInitializationService.getMatrixCredentials`
   * and `MatrixChatStore.getMatrixToken` — having two meant two CF calls could race and
   * each minted a server-side token that then accumulated.
   */
  private async fetchCredentials(): Promise<MatrixConfig | null> {
    const user = this.appStore.currentUser();
    if (!user) {
      console.warn('MatrixChatService.fetchCredentials: no user logged in');
      return null;
    }
    // server_name used in user IDs (e.g. @user:bkchat.etke.host); the homeserver URL
    // often carries a 'matrix.' subdomain that is NOT part of the server_name.
    const serverName = this.appStore.env.services.matrixHomeserver
      .replace(/^https?:\/\//, '')
      .replace(/^matrix\./, '');
    try {
      const stored = this.getStoredCredentials();
      if (stored) {
        const expectedUserId = `@${user.personKey.toLowerCase()}:${serverName}`;
        if (stored.userId === expectedUserId && this.isTokenUsable(stored)) {
          return {
            ...stored,
            homeserverUrl: stored.homeserverUrl || 'https://' + serverName,
            deviceId: stored.deviceId || `device_${user.personKey.toLowerCase()}`,
          };
        }
        // Stale (old UID-based id) or expiring (SCS-92) — discard and mint a fresh token.
        this.clearStoredCredentials();
      }

      const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'getMatrixCredentials');
      const result = await fn();
      const credentials = result.data as MatrixConfig;
      if (!credentials?.accessToken) throw new Error('Cloud Function returned invalid credentials');
      this.storeCredentials(credentials);
      return credentials;
    } catch (error) {
      console.error('MatrixChatService.fetchCredentials: failed', error);
      this.clearStoredCredentials();
      throw error;
    }
  }

  /**
   * Idempotent, promise-cached initialization. Fetches credentials (cached or via CF)
   * and starts the Matrix client exactly once per session — concurrent callers share the
   * same in-flight promise, so the early-init service and the chat component can both call
   * it without racing to mint two tokens (ARCH-1). Resolves immediately if already
   * initialized; a failed attempt clears the cache so a later call can retry.
   */
  async ensureInitialized(): Promise<void> {
    if (this.client) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const credentials = await this.fetchCredentials();
      if (!credentials) throw new Error('No Matrix credentials available');
      await this.initialize(credentials);
    })();
    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null; // allow a later retry
      throw error;
    }
  }

  get typing(): Observable<TypingNotification> {
    return this.roomList.typing;
  }

  get errors(): Observable<MatrixError> {
    return this.errors$.asObservable();
  }

  get tokenExpired(): Observable<void> {
    return this.tokenExpired$.asObservable();
  }

  /** Emits the id of a room that was evicted because the server no longer knows it. */
  get roomGone(): Observable<string> {
    return this.messages.roomGone;
  }

  get roomListToggle(): Observable<void> {
    return this.roomListToggle$.asObservable();
  }

  toggleRoomList(): void {
    this.roomListToggle$.next();
  }

  // Call state lives in MatrixCallService (ARCH-2 delegate); forwarded for API stability.
  get activeCall(): Observable<MatrixCall | null> {
    return this.calls.activeCall;
  }

  get callState(): Observable<string | null> {
    return this.calls.callState;
  }

  get callFeeds(): Observable<{ stream: MediaStream; isLocal: boolean }[]> {
    return this.calls.callFeeds;
  }

  /**
   * Initialize the Matrix client with the given configuration
   */
  async initialize(config: MatrixConfig): Promise<void> {
    if (this.client) {
      console.warn('MatrixChatService: Client already initialized');
      return;
    }

    // Apply the configured matrix-js-sdk log level (default: WARN) before the client starts logging,
    // so the console isn't flooded with the SDK's per-request debug lines. Admins can change the
    // level at runtime via the AOC chat console; the choice is persisted in localStorage.
    initMatrixLogLevel();

    // Safari < 17.4 has no Promise.withResolvers, which matrix-js-sdk uses internally
    // (send scheduler, http-api, sync). Install it before the client exists.
    ensurePromiseWithResolvers();

    try {
      const url = config.homeserverUrl.startsWith('https://') ? config.homeserverUrl : 'https://' + config.homeserverUrl;
      debugData('MatrixChatService: Initializing client with config:', {
        homeserverUrl: url,
        userId: config.userId,
        deviceId: config.deviceId,
        hasAccessToken: !!config.accessToken
      }, this.appStore.currentUser());

      // Persist rooms, members and the sync `since` token in IndexedDB so an iOS
      // reload-on-resume paints the chat list near-instantly and `/sync` resumes
      // incrementally instead of running a full initial sync. matrix-js-sdk handles
      // a missing/unavailable store gracefully — we fall back to the default
      // in-memory store. See docs/16_spec-pwa-caching.md §8.2.
      const clientOptions = {
        baseUrl: url,
        accessToken: config.accessToken,
        userId: config.userId,
        deviceId: config.deviceId,
        timelineSupport: true,
        useAuthorizationHeader: true,
      };

      const store = this.createPersistentStore();
      this.client = createClient({ ...clientOptions, ...(store ? { store } : {}) });

      this.setupEventHandlers();

      debugMessage('MatrixChatService: Starting client sync with initialSyncLimit=10', this.appStore.currentUser());

      // Start the client — sync happens in background via syncState$ events.
      // We don't wait for PREPARED here; doing so blocks the UI for up to 30 s on
      // slow networks (notably iOS). The store sets isMatrixInitialized=true right
      // after this returns, the spinner disappears, and rooms/messages update
      // reactively once PREPARED is reached.
      //
      // matrix-js-sdk does NOT call store.startup() from startClient() — the caller
      // must run it after createClient() (so the store's createUser hook is wired) and
      // before startClient(). store.startup() opens IndexedDB via the backend and loads
      // the cached rooms/sync token; without it the backend stays unconnected (its
      // internal `db` is undefined), the first /sync read throws "reading 'transaction'",
      // and the SDK silently degrades to an in-memory store — defeating the cache.
      // startup() itself can reject (private mode, eviction); the catch below then
      // recreates the client with the default in-memory store and pays a full sync.
      try {
        if (store) await store.startup();
        await this.client.startClient({ initialSyncLimit: 10 });
      } catch (startError) {
        if (!store) throw startError;
        console.warn('MatrixChatService: IndexedDB store startup failed, falling back to in-memory store:', startError);
        this.client.stopClient();
        this.client = createClient(clientOptions);
        this.setupEventHandlers();
        await this.client.startClient({ initialSyncLimit: 10 });
      }
      debugMessage('MatrixChatService: Client started, sync in progress', this.appStore.currentUser());

      // Incoming calls are emitted directly on the MatrixClient (not on callEventHandler).
      // See: matrixClient.on("Call.incoming", function(call){ call.answer(); });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.client as any).on('Call.incoming', (call: MatrixCall) => {
        this.calls.handleIncomingCall(call);
      });

      // Wire the ARCH-2 delegates to the live client
      this.media.setClient(this.client);
      this.calls.setClient(this.client);

      this.isInitialized$.next(true); // C-9: single source the store observes
    } catch (error) {
      console.error('MatrixChatService: Failed to initialize client', error);
      this.client = null; // reset so a retry attempt can create a fresh client
      this.isInitialized$.next(false);
      throw error;
    }
  }

  /**
   * Create an IndexedDB-backed Matrix store so rooms, members and the sync `since`
   * token survive page reloads (notably iOS reload-on-resume). Returns undefined if
   * IndexedDB is unavailable (SSR). The store is NOT started here — `startup()` must
   * be called after the store is assigned to a client (it needs the client's createUser
   * hook). initialize() calls `store.startup()` itself right before `startClient()`;
   * matrix-js-sdk does NOT do this for us.
   */
  private createPersistentStore(): Store | undefined {
    if (typeof window === 'undefined' || !window.indexedDB) return undefined;
    try {
      return new IndexedDBStore({
        indexedDB: window.indexedDB,
        localStorage: window.localStorage,
        dbName: 'okr-matrix',
      });
    } catch (e) {
      console.warn('MatrixChatService: IndexedDB store creation failed, using in-memory store:', e);
      return undefined;
    }
  }

  /**
   * The room that connects the current user with a group, created on first use.
   *
   * The Cloud Function decides WHICH room that is: the shared group room for a member, an
   * own room with the whole group for a non-member of a `chatMode: 'ask'` group (Notfall,
   * Support). It also force-joins the caller through the Synapse admin API, because a
   * client-side join on a private room is refused with 403 — so resolving a room any other
   * way (by name, or from a group's persisted `matrixRoomId`) yields a room the caller
   * cannot post into.
   */
  public async requestGroupRoomAccess(groupId: string): Promise<{ roomId: string; joined: boolean }> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'requestGroupRoomAccess');
    const result = await fn({ groupId });
    return result.data as { roomId: string; joined: boolean };
  }

  /**
   * Disconnect and cleanup the Matrix client.
   *
   * @param clearCache - only true on logout. clearStores() runs indexedDB.deleteDatabase('okr-matrix'),
   *   which fires `onversionchange` in every OTHER tab holding that DB: their backend closes and nulls
   *   its `db`, so the next `/sync` write throws "Cannot read properties of undefined (reading 'transaction')"
   *   and matrix-js-sdk degrades that tab to a MemoryStore. On a same-user reconnect (token refresh) the
   *   cache is still valid, so keep it.
   */
  async disconnect(clearCache = false): Promise<void> {
    this.roomList.stopUpdateTrigger();
    document.removeEventListener('visibilitychange', this.kickSync);
    window.removeEventListener('online', this.kickSync);
    this.media.setClient(null);  // revokes + clears the blob-URL cache
    this.calls.setClient(null);  // resets call state
    this.roomList.clearTyping();
    this.messages.clearTransient();
    if (this.client) {
      this.client.stopClient();
      if (clearCache) await this.client.clearStores();
      this.client = null;
      this.initPromise = null; // ARCH-1: allow a fresh ensureInitialized() after reconnect
      this.isInitialized$.next(false);
      this.dm.setClient(null);
      this.messages.setClient(null);
      this.roomList.reset();       // detaches the client and emits an empty list
      this.syncState$.next('STOPPED');
      debugMessage('MatrixChatService: Client disconnected', this.appStore.currentUser());
    }
  }

  /**
   * Set up event handlers for the Matrix client
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Hand the live client to the read-side delegates before any event can fire.
    // Re-runs on the in-memory-store fallback path in initialize(), which is why this is
    // idempotent rather than a one-off in the constructor.
    this.dm.setClient(this.client);
    this.roomList.setClient(this.client);
    this.messages.setClient(this.client);

    // Nudge the sync loop when the tab becomes visible again or the network returns.
    // A desktop tab that survived sleep/hibernate or a network drop keeps a dead long-poll
    // `/sync` socket: background tabs have their timers frozen, so the SDK's own retry may
    // never fire and the state stays 'SYNCING' — silently stale, no error, no overlay
    // (matrix-chat.ts only shows one for non-PREPARED/SYNCING states). The phone doesn't
    // hit this because iOS kills and reloads the PWA, which re-initializes from scratch.
    // retryImmediately() is a no-op when the loop is healthy.
    // Re-registered on the fallback path in initialize(), hence the remove-first.
    document.removeEventListener('visibilitychange', this.kickSync);
    window.removeEventListener('online', this.kickSync);
    document.addEventListener('visibilitychange', this.kickSync);
    window.addEventListener('online', this.kickSync);

    // Debounce room list rebuilds so rapid-fire Timeline/RoomState events collapse into one update
    this.roomList.startUpdateTrigger();

    // Sync state changes
    this.client.on(ClientEvent.Sync, (state, _prevState, data) => {
/*       debugData('MatrixChatService: Sync state changed:', {
        state,
        prevState,
        syncedRooms: this.client?.getRooms()?.length || 0,
        data
      }, this.appStore.currentUser()); */
      
      this.syncState$.next(state);
      
      if (state === 'PREPARED') {
        debugMessage('MatrixChatService: Initial sync complete, updating rooms list', this.appStore.currentUser());
        this.dm.repairDmRoomsAccountData().then(async () => {
          await this.roomList.updateRoomsList();
          this.roomList.markRoomsLoaded();
          this.messages.refreshAllReceipts();
        });
      } else if (state === 'ERROR') {
        const matrixError = data?.error as MatrixError | undefined;
        if (matrixError?.errcode === 'M_UNKNOWN_TOKEN') {
          console.warn('MatrixChatService: Access token expired (ERROR state) — clearing credentials');
          this.clearStoredCredentials();
          this.tokenExpired$.next();
        } else {
          // The SDK reaches ERROR after three failed /sync requests in a row or a failed
          // keep-alive (/versions). Log the parts that tell those cases apart — errcode,
          // HTTP status, message — so a "Verbindungsfehler" report can be attributed.
          const err = data?.error as (MatrixError & { httpStatus?: number; name?: string }) | undefined;
          console.error('MatrixChatService: Sync error', {
            errcode: err?.errcode, httpStatus: err?.httpStatus, name: err?.name, message: err?.message,
            online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
            hidden: typeof document !== 'undefined' ? document.hidden : undefined,
          });
          if (matrixError) this.errors$.next(matrixError);
        }
      } else if (state === 'STOPPED') {
        const errcode = (data?.error as MatrixError | undefined)?.errcode;
        if (errcode === 'M_UNKNOWN_TOKEN') {
          console.warn('MatrixChatService: Access token expired — clearing credentials and requesting re-auth');
          this.clearStoredCredentials();
          this.tokenExpired$.next();
        }
      }
    });

    // Room events — live timeline only (toStartOfTimeline=true means historical/pagination events)
    this.client.on(RoomEvent.Timeline, (event: MatrixEvent, room: Room | undefined, toStartOfTimeline: boolean | undefined) => {
      if (toStartOfTimeline) return;
      if (!room) return;
      this.messages.handleTimelineEvent(event, room);
    });

    // Timeline reset — rebuild the open room's message list from the FRESH live timeline.
    // When an incremental /sync comes back with `timeline.limited: true` (a gap, e.g. after
    // the device dropped connectivity and reconnected — very common on iOS, where the app is
    // backgrounded/killed and resumes with an incremental sync from the persisted `since`
    // token), matrix-js-sdk calls room.resetLiveTimeline() and emits RoomEvent.TimelineReset
    // (sync.js). That discards the room's live timeline. Our message list is built once from
    // the timeline and then only APPENDED to, so without re-reading the new timeline here the
    // events delivered across the gap are never merged in — leaving a permanent hole spanning
    // the offline period (bug: messages visible on desktop but not on the phone).
    this.client.on(RoomEvent.TimelineReset, (room: Room | undefined) => {
      if (!room) return;
      this.messages.handleTimelineReset(room);
    });

    // When a sent message is confirmed by the server, replace the local-echo entry
    // (temp ID like ~!room:id.$local) with the confirmed event (real server ID).
    this.client.on(RoomEvent.LocalEchoUpdated, (event: MatrixEvent, room: Room, oldEventId?: string) => {
      this.messages.handleLocalEcho(event, room, oldEventId);
    });

    // Typing notifications
    this.client.on('RoomMember.typing' as any, (_event: MatrixEvent, member: RoomMember) => {
      const room = this.client?.getRoom(member.roomId);
      if (room) {
        const typingMembers = room.getMembers().filter((m: any) => m.typing);
        this.roomList.noteTyping(room.roomId, typingMembers.map((u: any) => u.userId));
      }
    });

    // Room state updates (name, topic, avatar changes)
    this.client.on(RoomStateEvent.Events, (_event: MatrixEvent) => {
      this.roomList.triggerUpdate();
      this.roomStateVersion$.next(this.roomStateVersion$.value + 1);
    });

    // Room tags — `m.favourite` decides whether a room is pinned to the top of the room list.
    // Tags live in account data, so this also fires when the user pins the room on another device.
    this.client.on(RoomEvent.Tags, () => {
      this.roomList.triggerUpdate();
    });

    // Read receipts — update room list so unread counts reflect the new read position
    this.client.on(RoomEvent.Receipt, (_event: MatrixEvent, room: Room) => {
      this.roomList.triggerUpdate();
      if (room) this.messages.refreshReceipts(room);
    });

    // Redactions — either mark a message as deleted, or refresh reactions if a reaction was removed
    this.client.on(RoomEvent.Redaction, (event: MatrixEvent, room: Room) => {
      this.messages.handleRedaction(event, room);
    });
  }

  public getCurrentUserId(): string | undefined {
    if (!this.client) return undefined;
    if (!this.client.getUserId()) return undefined;
    return this.client.getUserId() ?? undefined;
  }

  /**
   * Returns the current Matrix user, or undefined if not available.
   * A Matrix user has displayName: string and avatarUrl: string.
   * @returns the current matrix user
   */
  public getCurrentUser(): User | undefined {
    const uid = this.getCurrentUserId();
    if (!uid || !this.client) return undefined;
    return this.client.getUser(uid) ?? undefined;
  }

  /**
   * Returns the display name of a given matrix user, or the local part of their user ID as fallback.
   * you can use it with getCurrentUser() or a specific user from a message sender.
   * @param user the matrix user to get the display name for (can be obtained from getCurrentUser() or from a message sender)
   * @returns the display name of the user, or a fallback string if not available
   */
  public getCurrentDisplayName(user?: User): string | undefined {
    if (!user || !user.displayName) return undefined;
    return user.displayName || user.userId?.split(':')[0].substring(1) || 'You';
  }

  /**
   * Returns the display name of a room member (the person's full name as provisioned
   * on the Matrix profile), falling back to the localpart of the Matrix user ID.
   */
  public getMemberDisplayName(roomId: string, userId: string): string {
    const member = this.client?.getRoom(roomId)?.getMember(userId);
    return resolveMatrixDisplayName(member?.rawDisplayName, userId);
  }

  /**
   * Returns the avatar url of a given matrix user.
   * you can use it with getCurrentUser() or a specific user from a message sender.
   * @param user the user object to get the avatar for
   * @param size the desired size of the avatar (default: 96) - Matrix can generate different sizes from the original
   * @returns the avatar url of the user, or undefined if not available
   */
  public getAvatarUrl(user?: User, size: number = 96): string | undefined {
    return mxcAvatarHttpUrl(this.client, user, size);
  }

  /**
   * Tenant marker for a room created from this app: the room belongs to the tenant it was
   * created in. Without it the room would show up in every tenant's chat list, because one
   * Matrix account serves the person everywhere.
   */
  private tenantMarkerState(): ICreateRoomOpts['initial_state'] {
    const tenantId = this.appStore.tenantId();
    if (!tenantId) return undefined;
    return [{ type: OKR_TENANT_EVENT, state_key: '', content: { tenants: [tenantId] } }];
  }

  /**
   * Pin or unpin a room for the current user by setting/removing its `m.favourite` tag. The
   * room list is not patched here: the homeserver echoes the change back as RoomEvent.Tags,
   * which rebuilds the list — the same path a pin made on another device takes.
   */
  public setRoomFavourite(roomId: string, favourite: boolean): Promise<void> {
    return this.roomList.setRoomFavourite(roomId, favourite);
  }

  // ─── Timeline reads — delegated to MatrixMessageService (ARCH-2, design review #4) ──

  /** Messages of a room; loads (and back-fills) the room's timeline on first subscription. */
  public getMessagesForRoom(roomId: string): Observable<MatrixMessage[] | null> {
    return this.messages.getMessagesForRoom(roomId);
  }

  /** Read receipts of a room, keyed by the event they point at. */
  public getReadReceiptsForRoom(roomId: string): Observable<Map<string, MatrixReadReceipt[]>> {
    return this.messages.getReadReceiptsForRoom(roomId);
  }

  /**
   * Load older messages by paginating the live timeline backwards (C-5, scroll-up history).
   * @returns true if more history may be available, false at the start of the room.
   */
  public paginateRoomBackwards(roomId: string): Promise<boolean> {
    return this.messages.paginateRoomBackwards(roomId);
  }

  /**
   * Send a text message to a room, optionally with person/room mentions.
   */
  async sendMessage(
    roomId: string,
    text: string,
    threadId?: string,
    mentions?: MentionRef[],
    mentionRoom?: boolean,
  ): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    const content: IContent = {
      msgtype: MsgType.Text,
      body: text,
    };

    if (threadId) {
      content['m.relates_to'] = {
        rel_type: RelationType.Thread,
        event_id: threadId,
      };
    }

    const resolved = (mentions ?? []).map((m) => ({
      display: m.display,
      userId: this.personKeyToMatrixUserId(m.personKey),
    }));
    const mc = buildMentionContent(text, resolved, !!mentionRoom);
    if (mc) {
      content['m.mentions'] = mc.mentions;
      if (mc.formatted_body) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = mc.formatted_body;
      }
    }

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }

  async sendHtmlMessage(roomId: string, plainText: string, html: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');
    return this.client.sendEvent(roomId, EventType.RoomMessage, {
      msgtype: MsgType.Text,
      body: plainText,
      format: 'org.matrix.custom.html',
      formatted_body: html,
    } as any);
  }

  /**
   * Send a file/image to a room
   */
  async sendFile(roomId: string, file: File, threadId?: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    file = await convertHeicToJpeg(file);

    // Never branch on `file.type` directly: it is empty for anything picked through the
    // iOS Files app / iCloud Drive, shared into the PWA, or dragged from some Windows
    // sources, which used to ship a perfectly good PNG as `m.file` with `mimetype: ''`
    // and render it as a document card. resolveFileMimeType falls back to the extension.
    const mimetype = resolveFileMimeType(file);

    // Images are read into memory before upload, and the read is verified. A File handle
    // whose backing storage the browser has already released reads as zero bytes WITHOUT
    // throwing, while `file.size` still reports the original length — so `uploadContent`
    // happily PUTs an empty body, Synapse answers 200, and the event that follows points at
    // a 0-byte object that renders as nothing. Uploading the buffer instead of the handle
    // closes that window, and `size` on the buffered File is the real byte count, so an
    // empty read finally fails loudly here (the callers' allSettled toast) instead of
    // landing in the room as a permanently blank image. Non-images stream off disk as
    // before — a video must not be buffered in memory just to be sent.
    if (mimetype.startsWith('image/')) {
      file = await materializeFile(file);
      if (file.size === 0) throw new Error(`sendFile: refusing to upload empty image ${file.name}`);
    }

    // A video's poster frame is extracted BEFORE the upload, while the File handle is
    // certainly still readable, and never blocks the send: extractVideoPoster answers null
    // for anything the browser cannot decode (many iPhone .mov files on Chrome/Firefox).
    const poster = mimetype.startsWith('video/') ? await extractVideoPoster(file) : null;

    // Upload the file
    const upload = await this.client.uploadContent(file);
    const url = upload.content_uri;

    const info: IContent = { size: file.size, mimetype };

    if (poster) {
      info['w'] = poster.videoWidth;
      info['h'] = poster.videoHeight;
      info['duration'] = poster.durationMs; // milliseconds, per the m.video spec
      try {
        const posterFile = new File([poster.blob], `${file.name}.thumb.jpg`, { type: 'image/jpeg' });
        const thumbUpload = await this.client.uploadContent(posterFile);
        info['thumbnail_url'] = thumbUpload.content_uri;
        info['thumbnail_info'] = {
          w: poster.width,
          h: poster.height,
          mimetype: 'image/jpeg',
          size: poster.blob.size,
        };
      } catch (err) {
        // The video itself is already uploaded — losing its thumbnail must not lose the message.
        console.warn('MatrixChatService.sendFile: thumbnail upload failed, sending without it:', err);
      }
    }

    const content: IContent = {
      msgtype: msgTypeForMimeType(mimetype),
      body: file.name,
      url: url,
      info,
    };

    if (threadId) {
      content['m.relates_to'] = {
        rel_type: RelationType.Thread,
        event_id: threadId,
      };
    }

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }

  /**
   * Send a location message
   */
  async sendLocation(roomId: string, text: string, latitude: number, longitude: number, threadId?: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    const content: IContent = {
      msgtype: MsgType.Location,
      body: text,
      geo_uri: `geo:${latitude},${longitude}`,
      info: {
        maps_link: mapsLink,
      },
    };

    if (threadId) {
      content['m.relates_to'] = {
        rel_type: RelationType.Thread,
        event_id: threadId,
      };
    }

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }

  /**
   * Send a poll (MSC3381) — always disclosed
   */
  async sendPoll(roomId: string, data: MatrixPollData): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const answers = data.answers.map((body, i) => ({
      id: String(i + 1),
      'org.matrix.msc3381.poll.answer': { msgtype: 'm.text', body }
    }));
    const fallback = `${data.question}\n${data.answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;

    await this.client.sendEvent(roomId, 'org.matrix.msc3381.poll.start' as any, {
      'org.matrix.msc3381.poll': {
        question: { msgtype: 'm.text', body: data.question },
        kind: 'org.matrix.msc3381.poll.disclosed',
        max_selections: data.maxSelections ?? 1,
        answers
      },
      body: fallback
    } as any);
  }

  /**
   * Send a poll vote response (MSC3381). Supports single and multiple selections.
   */
  async sendPollResponse(roomId: string, pollEventId: string, answerIds: string[]): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    await this.client.sendEvent(roomId, 'org.matrix.msc3381.poll.response' as any, {
      'org.matrix.msc3381.poll.response': { answers: answerIds },
      'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId }
    } as any);
  }

  /**
   * End a poll (MSC3381) — only the poll creator should call this
   */
  async sendPollEnd(roomId: string, pollEventId: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    await this.client.sendEvent(roomId, 'org.matrix.msc3381.poll.end' as any, {
      'org.matrix.msc3381.poll.end': {},
      'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId },
      body: 'The poll has ended.'
    } as any);
  }

  /**
   * Edit a message
   */
  async editMessage(roomId: string, eventId: string, newText: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    const content: IContent = {
      msgtype: MsgType.Text,
      body: `* ${newText}`,
      'm.new_content': {
        msgtype: MsgType.Text,
        body: newText,
      },
      'm.relates_to': {
        rel_type: RelationType.Replace,
        event_id: eventId,
      },
    };

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }

  /**
   * React to a message, or remove an existing identical reaction (toggle).
   * Case 2: not yet reacted → send reaction.
   * Case 3: already reacted with same emoji → redact the existing reaction event.
   * Case 4: counter increment for other senders is handled automatically via RoomEvent.Timeline.
   */
  async reactToMessage(roomId: string, eventId: string, emoji: string): Promise<ISendEventResponse | void> {
    if (!this.client) throw new Error('Client not initialized');

    const currentUserId = this.client.getUserId();
    const room = this.client.getRoom(roomId);

    if (room && currentUserId) {
      const relations = room.relations.getChildEventsForEvent(
        eventId,
        RelationType.Annotation,
        'm.reaction'
      );
      const existing = relations?.getRelations().find(
        e => e.getSender() === currentUserId && e.getContent()?.['m.relates_to']?.key === emoji
      );
      if (existing?.getId()) {
        // Toggle off: redact the existing reaction
        await this.client.redactEvent(roomId, existing.getId()!);
        return;
      }
    }

    return this.client.sendEvent(roomId, EventType.Reaction, {
      'm.relates_to': {
        rel_type: RelationType.Annotation,
        event_id: eventId,
        key: emoji,
      },
    });
  }

  /**
   * Send typing notification
   */
  async sendTyping(roomId: string, isTyping: boolean, timeoutMs: number = 30000): Promise<void> {
    if (!this.client) return;
    await this.client.sendTyping(roomId, isTyping, timeoutMs);
  }

  /**
   * Send read receipt for a specific event.
   */
  async sendReadReceipt(roomId: string, eventId: string): Promise<void> {
    if (!this.client) return;
    const room = this.client.getRoom(roomId);
    if (!room) return;
    const event = room.findEventById(eventId);
    if (!event) return;
    // Unthreaded receipt (3rd arg): clears BOTH main-timeline and thread notifications.
    // getUnreadNotificationCount('total') sums main + every thread, so a threaded
    // receipt would leave thread notifications — a permanent phantom unread badge.
    await this.client.sendReadReceipt(event, ReceiptType.Read, true);
  }

  /**
   * Mark all messages in a room as read by sending a read receipt for the latest event.
   * This resets the unread count for the room on the server side.
   * The rooms$ observable is updated when the server acknowledges via RoomEvent.Receipt.
   */
  async markRoomAsRead(roomId: string): Promise<void> {
    if (!this.client) return;
    const room = this.client.getRoom(roomId);
    if (!room) return;
    const events = room.getLiveTimeline().getEvents();
    // Walk back to find the latest event that is not a state event
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.getId() && !event.isState()) {
        // Unthreaded receipt (3rd arg): clears BOTH main-timeline and thread
        // notifications. getUnreadNotificationCount('total') sums main + every thread,
        // so a threaded receipt leaves thread notifications as a phantom unread badge.
        await this.client.sendReadReceipt(event, ReceiptType.Read, true);
        return;
      }
    }
  }

  /**
   * Register a room that was joined via the CF admin API but hasn't appeared in a
   * sync cycle yet. updateRoomsList() will inject a stub for it on every rebuild
   * until the real room data arrives via sync.
   */
  registerPendingRoom(roomId: string, name: string): void {
    this.roomList.registerPendingRoom(roomId, name);
  }

  /**
   * Resolve once the initial sync has populated rooms and account data (m.direct).
   * Returns immediately if already synced; otherwise waits up to timeoutMs then proceeds.
   * Used before DM find-or-create so a cold cache can't cause a duplicate DM room (S2).
   */
  private async waitForSync(timeoutMs = 8000): Promise<void> {
    const isReady = (s: string) => s === 'PREPARED' || s === 'SYNCING';
    if (isReady(this.syncState$.value)) return;
    await new Promise<void>(resolve => {
      const sub = this.syncState$.subscribe(s => {
        if (isReady(s)) { sub.unsubscribe(); resolve(); }
      });
      setTimeout(() => { sub.unsubscribe(); resolve(); }, timeoutMs);
    });
  }

  /**
   * Find an existing direct message room with the given Matrix user ID.
   * Checks the m.direct account data and returns the first joined/invited room.
   */
  findExistingDirectRoom(matrixUserId: string): string | undefined {
    return this.dm.findExistingDirectRoom(matrixUserId);
  }

  /** Derive a Matrix user id from a Person.okey: '@{okey-lowercased}:{homeserver}'. */
  private personKeyToMatrixUserId(personKey: string): string {
    if (!this.client) throw new Error('Client not initialized');
    const hostname = new URL(this.client.baseUrl).hostname.replace('matrix.', '');
    return `@${personKey.toLowerCase()}:${hostname}`;
  }

  /**
   * Localparts of all joined members of a room — the inverse of personKeyToMatrixUserId.
   * These are lowercased Person.okey values; the caller resolves them against the person
   * list (compare case-insensitively). Returns [] when the client or room is not ready.
   */
  public getRoomMemberPersonKeys(roomId: string): string[] {
    const room = this.client?.getRoom(roomId);
    if (!room) return [];
    return room
      .getMembers()
      .filter((m) => m.membership === 'join')
      .map((m) => m.userId.slice(1).split(':')[0]);
  }

  /**
   * Darf die angemeldete Person in diesem Raum schreiben? Liest allein das
   * `m.room.power_levels`-Event, das der Client ohnehin synchronisiert — kein zusaetzlicher
   * Aufruf, keine zweite Quelle. `true`, solange Client oder Raum noch nicht bereit sind.
   */
  public canPostInRoom(roomId: string): boolean {
    const room = this.client?.getRoom(roomId);
    const userId = this.client?.getUserId();
    if (!room || !userId) return true;
    const content = room.currentState
      .getStateEvents('m.room.power_levels', '')
      ?.getContent() as { events_default?: number } | undefined;
    return canPostWithPower(room.getMember(userId)?.powerLevel, content?.events_default);
  }

  /**
   * Create a new direct message room, or return an existing one if it already exists.
   * @param userId full Matrix user ID (@localpart:server) or a Person.okey (converted automatically)
   */
  async createDirectRoom(userId: string): Promise<Room> {
    if (!this.client) throw new Error('Client not initialized');

    // Ensure rooms + m.direct are loaded before find-or-create, otherwise a cold cache
    // makes findExistingDirectRoom() return nothing and we create a duplicate DM (S2).
    await this.waitForSync();

    // If userId is a Person.okey (no leading @), convert to @localpart:server
    let matrixUserId = userId;
    if (!userId.startsWith('@')) {
      matrixUserId = this.personKeyToMatrixUserId(userId);
    }

    // Find-or-create: return existing DM room if one already exists
    const existingRoomId = this.dm.findExistingDirectRoom(matrixUserId);
    if (existingRoomId) {
      const existing = this.client.getRoom(existingRoomId);
      if (existing) return existing;
    }

    // Verify the target user exists; if not, provision them via the Cloud Function.
    // Note: Synapse's profile endpoint may return 404 briefly after admin-API user creation
    // (the profile row is only populated on first explicit profile set). So we trust the CF
    // result and do NOT re-check getProfileInfo after provisioning.
    try {
      await this.client.getProfileInfo(matrixUserId);
    } catch {
      const localpart = matrixUserId.split(':')[0].substring(1); // strip leading @
      debugMessage(`MatrixChatService.createDirectRoom: user not found, provisioning via CF for personKey=${localpart}`, this.appStore.currentUser());
      try {
        const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'provisionMatrixUser');
        const result = await fn({ personKey: localpart });
        debugData(`MatrixChatService.createDirectRoom: provisionMatrixUser succeeded:`, result.data, this.appStore.currentUser());
        // Trust the CF result — the user now exists on Synapse. Proceed to room creation.
      } catch (provisionError) {
        console.error(`MatrixChatService.createDirectRoom: failed to provision ${matrixUserId}:`, provisionError);
        throw new Error(`Could not provision Matrix account for ${matrixUserId}: ${provisionError}`);
      }
    }

    const opts: ICreateRoomOpts = {
      preset: Preset.TrustedPrivateChat,
      is_direct: true,
      visibility: Visibility.Private,
      invite: [matrixUserId],
      initial_state: this.tenantMarkerState(),
    };

    const result = await this.client.createRoom(opts);

    // Mark as direct room in account data
    await this.dm.markRoomAsDirect(result.room_id, matrixUserId);

    const room = this.client.getRoom(result.room_id);
    if (!room) throw new Error('Failed to get created room');

    return room;
  }

  /**
   * Create a group room
   */
  async createGroupRoom(name: string, userIds: string[], topic?: string, visibility = Visibility.Private): Promise<Room> {
    if (!this.client) throw new Error('Client not initialized');
    const preset = visibility === Visibility.Public ? Preset.PublicChat : Preset.PrivateChat;
    const opts: ICreateRoomOpts = {
      name: name,
      topic: topic,
      preset,
      visibility,
      invite: userIds,
      initial_state: this.tenantMarkerState(),
    };

    const result = await this.client.createRoom(opts);
    const room = this.client.getRoom(result.room_id);
    if (!room) throw new Error('Failed to get created room');
    
    return room;
  }

  /**
   * Join a room by ID or alias
   */
  async joinRoom(roomIdOrAlias: string): Promise<Room> {
    if (!this.client) throw new Error('Client not initialized');

    const result = await this.client.joinRoom(roomIdOrAlias);
    const room = this.client.getRoom(result.roomId);
    if (!room) throw new Error('Failed to get joined room');
    
    return room;
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string): Promise<void> {
    if (!this.client) return;
    await this.client.leave(roomId);
  }


  /**
   * Get a room by ID
   */
  getRoom(roomId: string): Room | null {
    return this.client?.getRoom(roomId) || null;
  }

  /**
   * Get the current user ID
   */
  getUserId(): string | undefined {
    return this.client?.getUserId() || undefined;
  }

  /**
   * Search for users (if supported by homeserver)
   */
  async searchUsers(searchTerm: string, limit: number = 10): Promise<any[]> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      const result = await this.client.searchUserDirectory({ term: searchTerm, limit });
      return result.results || [];
    } catch (error) {
      console.error('MatrixChatService: User search failed', error);
      return [];
    }
  }

  /**
   * Set user avatar from existing URL
   * Downloads the image from the URL, uploads it to Matrix, and sets it as avatar
   */
  async setUserAvatarFromUrl(avatarUrl: string): Promise<string> {
    if (!this.client) throw new Error('Client not initialized');

    // Check localStorage cache to avoid re-uploading the same image every session
    const cachedFirebaseUrl = localStorage.getItem('matrix_avatar_firebase_url');
    const cachedMxcUrl = localStorage.getItem('matrix_avatar_mxc_url');
    if (cachedFirebaseUrl === avatarUrl && cachedMxcUrl) {
      return cachedMxcUrl;
    }

    try {
      // Fetch the image from the URL
      const response = await fetch(avatarUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch avatar: ${response.statusText}`);
      }

      // Convert to blob
      const blob = await response.blob();
      const file = new File([blob], 'avatar.jpg', { type: blob.type });

      // Upload the image file to Matrix content repository
      const upload = await this.client.uploadContent(file);
      const matrixAvatarUrl = upload.content_uri;

      // Set the uploaded image as the user's avatar
      await this.client.setAvatarUrl(matrixAvatarUrl);

      // Cache in localStorage to prevent re-uploading in future sessions
      localStorage.setItem('matrix_avatar_firebase_url', avatarUrl);
      localStorage.setItem('matrix_avatar_mxc_url', matrixAvatarUrl);

      return matrixAvatarUrl;
    } catch (error) {
      console.error('MatrixChatService: Failed to set user avatar from URL', error);
      throw error;
    }
  }

  /**
   * Set the avatar for a room by uploading an image from an HTTP URL.
   * Downloads the image, uploads it to the Matrix media repository,
   * then sends an m.room.avatar state event.
   */
  async setRoomAvatarFromUrl(roomId: string, imageUrl: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    if (!imageUrl || !imageUrl.startsWith('http')) return;

    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch room avatar: ${response.statusText}`);
    const blob = await response.blob();
    const file = new File([blob], 'room-avatar.jpg', { type: blob.type });
    const upload = await this.client.uploadContent(file);
    await this.client.sendStateEvent(roomId, 'm.room.avatar' as any, { url: upload.content_uri }, '');
  }

  /**
   * Update room name and/or topic.
   */
  async updateRoom(roomId: string, name?: string, topic?: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    if (name) await this.client.setRoomName(roomId, name);
    if (topic !== undefined) await this.client.setRoomTopic(roomId, topic);
  }

  /**
   * Invite a person (by personKey) to the Matrix chat room of a group.
   * Called when a new group membership is created.
   * The Cloud Function provisions the Matrix user if needed and force-joins them.
   */
  public async inviteToGroupRoom(groupId: string, personKey: string): Promise<void> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'invitePersonToGroupRoom');
    await fn({ groupId, personKey });
  }

  /**
   * Einen Ad-hoc-Chat anlegen: ein Chat mit mehreren Personen ohne eigene Gruppe
   * (planning/specs/2026-09-01-adhoc-chats-spec.md).
   *
   * Die Cloud Function legt Gruppendokument (`kind: 'chat'`), Matrix-Raum und die
   * Mitgliedschaften an und tritt alle Beteiligten bei — der Client schreibt selbst
   * nichts nach `groups`. Der zurueckgegebene `roomId` ist sofort benutzbar, auch wenn
   * der Raum erst mit dem naechsten Sync in der Raumliste erscheint.
   */
  public async createAdhocChat(tenantId: string, personKeys: string[], name?: string): Promise<{ groupKey: string; roomId: string; name: string }> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'createAdhocChat');
    const result = await fn({ tenantId, personKeys, name });
    return result.data as { groupKey: string; roomId: string; name: string };
  }

  /**
   * Personen zu einem bestehenden Ad-hoc-Chat hinzufuegen. Hinzufuegen darf, wer selbst
   * im Chat ist; eingeladen werden koennen nur Personen desselben Mandanten. Neue
   * Mitglieder lesen ab ihrem Beitritt mit, nicht rueckwaerts.
   * @returns die personKeys, die tatsaechlich dazugekommen sind (schon Anwesende fallen weg)
   */
  public async addAdhocChatMembers(groupKey: string, personKeys: string[]): Promise<string[]> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'addAdhocChatMembers');
    const result = await fn({ groupKey, personKeys });
    return (result.data as { added: string[] }).added;
  }

  /**
   * Einen Ad-hoc-Chat verlassen: beendet die eigene Mitgliedschaft. Der Rauswurf aus dem
   * Matrix-Raum folgt serverseitig ueber `onMembershipWritten`, also mit ein paar
   * Sekunden Verzoegerung.
   */
  public async leaveAdhocChat(groupKey: string): Promise<void> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'leaveAdhocChat');
    await fn({ groupKey });
  }

  /**
   * Remove a person (by personKey) from the Matrix chat room of a group.
   * Called when a group membership is ended.
   */
  public async kickFromGroupRoom(groupId: string, personKey: string): Promise<void> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'kickPersonFromGroupRoom');
    await fn({ groupId, personKey });
  }

  /**
   * Get the current user's avatar URL
   */
  getUserAvatarUrl(width: number = 96, height: number = 96): string | undefined {
    if (!this.client) return undefined;

    const userId = this.client.getUserId();
    if (!userId) return undefined;

    const user = this.client.getUser(userId);
    if (!user) return undefined;

    return (user as any).getAvatarUrl?.(this.client.baseUrl, width, height, 'crop');
  }

  // ─── WebRTC calls — delegated to MatrixCallService (ARCH-2, design review #4) ──

  startVideoCall(roomId: string, currentUser: UserModel | undefined): Promise<void> {
    return this.calls.startVideoCall(roomId, currentUser);
  }

  hangupCall(): void {
    this.calls.hangupCall();
  }

  answerCall(): Promise<void> {
    return this.calls.answerCall();
  }

  /**
   * Delete (redact) a message event.
   */
  async deleteMessage(roomId: string, eventId: string, reason?: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    await this.client.redactEvent(roomId, eventId, undefined, reason ? { reason } : undefined);
  }

  /**
   * Send a reply to a message (Matrix m.in_reply_to format), optionally with mentions.
   */
  async sendReply(
    roomId: string,
    text: string,
    replyToEventId: string,
    replyToBody: string,
    replyToSender: string,
    replyToSenderName: string,
    threadId?: string,
    mentions?: MentionRef[],
    mentionRoom?: boolean,
  ): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    const resolved = (mentions ?? []).map((m) => ({
      display: m.display,
      userId: this.personKeyToMatrixUserId(m.personKey),
    }));
    const mc = buildMentionContent(text, resolved, !!mentionRoom);
    const trailing = mc?.formatted_body ?? text;

    // The rich-reply header shows the OKR person's display name (not the raw Matrix id) but keeps the
    // matrix.to/<mxid> href — the message list intercepts that anchor (extractMentionLocalpart →
    // personSelected) and routes the tap to the OKR person page. The plain-text `body` fallback keeps the
    // mxid form (`> <@user:server>`) required by the spec for reply-fallback stripping in other clients.
    const senderLink = `<a href="https://matrix.to/#/${escapeHtml(replyToSender)}">${escapeHtml(replyToSenderName)}</a>`;
    const fallback = `> <${replyToSender}> ${replyToBody}\n\n${text}`;
    const content: IContent = {
      msgtype: MsgType.Text,
      body: fallback,
      format: 'org.matrix.custom.html',
      formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${roomId}/${replyToEventId}">In reply to</a> ${senderLink}<br>${replyToBody}</blockquote></mx-reply>${trailing}`,
      'm.relates_to': {
        'm.in_reply_to': { event_id: replyToEventId },
        ...(threadId ? { rel_type: RelationType.Thread, event_id: threadId } : {}),
      },
    };
    if (mc) content['m.mentions'] = mc.mentions;

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }
}
