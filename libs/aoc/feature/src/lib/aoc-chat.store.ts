import { computed, inject, Injector, runInInjectionContext } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, from, of } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { FirestoreService } from '@okr/shared-data-access';
import { ArticleSection, CalendarCollection, CalendarModel, ChatSection, ColorIonic, GroupCollection, GroupModel, GroupModelName, ImageActionType, PageCollection, PageModel, SectionCollection, UserModel, ViewPosition } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { showToast } from '@okr/shared-util-angular';
import { AOC_I18N_KEYS } from '@okr/aoc-util';
import { findGroupOfRoom, getMatrixLogLevel, setMatrixLogLevel, MatrixLogLevel } from '@okr/chat-util';
import type { MatrixMediaService } from '@okr/chat-data-access';

// ─── types mirroring the cloud-function interfaces ───────────────────────────
export interface AdminRoom {
  roomId: string;
  name: string;
  canonicalAlias?: string;
  joinedMembers: number;
  creator?: string;
  public: boolean;
  /** Display label for a room without an m.room.name — "DM: A ↔ B". Derived server-side. */
  derivedName?: string;
}

export interface RoomDetails {
  id: string;
  name: string;
  normalizedName: string;
  isDirect: boolean;
  isPublic: boolean;
  creator: string;
  avatarUrl?: string;
  aliases: string[];
  topic?: string;
  numberOfJoinedMembers: number;
  numberOfInvitedMembers: number;
}

export interface RoomMemberInfo {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  membership: string;
  powerLevel: number;
}

export interface MemberDetails {
  userId: string;
  name: string;
  rawDisplayName: string;
  powerLevel: number;
  membership?: string;
  avatarUrl?: string;
}

export interface DisplayNameRepairEntry {
  matrixUserId: string;
  from: string;
  to: string;
}

export interface DisplayNameRepairResult {
  scanned: number;
  repaired: DisplayNameRepairEntry[];
  skippedNoPerson: string[];
  skippedCustomName: DisplayNameRepairEntry[];
  applied: boolean;
}

export interface AvatarRepairEntry {
  matrixUserId: string;
  avatarUrl: string;
}

export interface AvatarRepairResult {
  scanned: number;
  repaired: AvatarRepairEntry[];      // blank avatar → filled with the person avatar (mxc)
  migratedHttp: AvatarRepairEntry[];  // legacy https avatar → re-uploaded to the media repo as mxc
  skippedNoAvatar: string[];
  skippedHasAvatar: number;
  applied: boolean;
}
/** One room the tenant backfill would stamp. */
export interface TenantBackfillEntry {
  roomId: string;
  name: string;
  tenants: string[];
}

export interface TenantBackfillResult {
  stamped: number;
  alreadyMarked: number;
  ambiguous: string[];
  changes: Record<string, string[]>;
  names: Record<string, string>;
  dryRun: boolean;
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One group's Matrix room compared against its active memberships (auditGroupRoomMembers).
 *
 * `extras` are room members WITHOUT a membership. They are not an error: opening a group's
 * chat tab force-joins any user via requestGroupRoomAccess, deliberately so, and nothing
 * ever undoes it — which is why the group view and the chat room can disagree.
 */
export interface GroupRoomDrift {
  groupKey: string;
  groupName: string;
  roomId: string;
  memberCount: number;
  roomMemberCount: number;
  missing: string[];
  extras: Array<{ userId: string; displayName: string }>;
}

/**
 * One message of a room, as `getRoomMessages` returns it. Mirrors the Cloud Function's
 * `RoomMessageInfo` — functions cannot import from libs, so the shape is kept in sync by hand.
 */
export interface RoomMessageInfo {
  eventId: string;
  sender: string;
  senderName: string;
  body: string;
  msgtype: string;
  url?: string;
  timestamp: number;
  isRedacted: boolean;
}

export type DetailsTarget = 'room' | 'member';

export type AocChatState = {
  selectedPersonKey: string | undefined;
  selectedRoomId: string | undefined;
  selectedMemberId: string | undefined;
  detailsTarget: DetailsTarget | undefined;
  logLevel: MatrixLogLevel;
  // display-name repair (SCS-13)
  repairPreview: DisplayNameRepairEntry[] | undefined; // undefined = not yet scanned
  repairSkippedCustom: number;
  repairScanning: boolean;
  repairApplying: boolean;
  // avatar repair — fill Matrix avatars from avatars/person.<key>
  avatarRepairPreview: AvatarRepairEntry[] | undefined; // undefined = not yet scanned
  avatarRepairSkippedHas: number;
  avatarRepairScanning: boolean;
  avatarRepairApplying: boolean;
  // tenant backfill — stamp rooms with the tenants they belong to
  tenantRepairPreview: TenantBackfillEntry[] | undefined; // undefined = not yet scanned
  tenantRepairAmbiguous: number;
  tenantRepairScanning: boolean;
  tenantRepairApplying: boolean;
  memberRepairApplying: boolean;
  memberRepairJoined: number;
  // group-room write-permission sync
  postPolicySyncApplying: boolean;
  postPolicySyncChanged: number;
  // group-room drift — room members without a membership
  guestPreview: GroupRoomDrift[] | undefined; // undefined = not yet scanned
  guestScanning: boolean;
  guestPruningGroup: string | undefined;      // groupKey currently being pruned
  // read-only room history (admin window into a room they are not in)
  history: RoomMessageInfo[];
  historyRoomId: string | undefined;
  /** Synapse pagination token for the NEXT page backwards; undefined = start of the room. */
  historyCursor: string | undefined;
  historyLoading: boolean;
};

const initialState: AocChatState = {
  selectedPersonKey: undefined,
  selectedRoomId: undefined,
  selectedMemberId: undefined,
  detailsTarget: undefined,
  logLevel: getMatrixLogLevel(),
  repairPreview: undefined,
  repairSkippedCustom: 0,
  repairScanning: false,
  repairApplying: false,
  avatarRepairPreview: undefined,
  avatarRepairSkippedHas: 0,
  avatarRepairScanning: false,
  avatarRepairApplying: false,
  tenantRepairPreview: undefined,
  tenantRepairAmbiguous: 0,
  tenantRepairScanning: false,
  tenantRepairApplying: false,
  memberRepairApplying: false,
  memberRepairJoined: 0,
  postPolicySyncApplying: false,
  postPolicySyncChanged: 0,
  guestPreview: undefined,
  guestScanning: false,
  guestPruningGroup: undefined,
  history: [],
  historyRoomId: undefined,
  historyCursor: undefined,
  historyLoading: false,
};

function getFn() {
  return getFunctions(getApp(), 'europe-west6');
}

export const AocChatStore = signalStore(
  withState(initialState),
  withProps(() => {
    // `@okr/chat-data-access` is the barrel in front of matrix-js-sdk: importing it
    // statically binds ~890 KB (the matrix chunk plus the SDK chunk it pulls) into the AOC
    // section chunk, which every AOC page then downloads — the tenant list, the storage
    // page, the kiosk page, none of which touch Matrix. A static import is the binding edge,
    // so the only way out is to not have one: the type import above carries no runtime edge,
    // and the service is resolved on first use through the injector.
    //
    // Same reasoning as `aoc-kiosk.store` and `trip.store`, which already lazy-load this lib.
    const injector = inject(Injector);
    let service: Promise<MatrixMediaService> | undefined;
    const load = (): Promise<MatrixMediaService> => (service ??= import('@okr/chat-data-access')
      .then(m => runInInjectionContext(injector, () => inject(m.MatrixMediaService))));

    return {
      appStore: inject(AppStore),
      alertController: inject(AlertController),
      modalController: inject(ModalController),
      toastController: inject(ToastController),
      i18nService: inject(I18nService),
      firestoreService: inject(FirestoreService),
      // Shaped like the service so the call sites read unchanged. Every caller is already
      // async (an rxResource stream), so the one-time import costs them nothing extra.
      media: {
        resolveMediaUrl: async (mxcUrl: string | undefined, mimeTypeHint?: string): Promise<string> =>
          (await load()).resolveMediaUrl(mxcUrl, mimeTypeHint),
      },
    };
  }),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
  })),

  // ─── rxResources ────────────────────────────────────────────────────────────
  withProps(store => ({

    /** All rooms (filtered by personKey when set). */
    roomsResource: rxResource({
      params: () => ({ selectedPersonKey: store.selectedPersonKey() }),
      stream: ({ params }) => {
        const fn = httpsCallable<{ personKey?: string }, { rooms: AdminRoom[]; total: number }>(
          getFn(), 'listMatrixRooms'
        );
        return from(
          fn(params.selectedPersonKey ? { personKey: params.selectedPersonKey } : {})
            .then(r => r.data.rooms)
        );
      },
    }),

    /** Members of the currently selected room. */
    membersResource: rxResource({
      params: () => ({ selectedRoomId: store.selectedRoomId() }),
      stream: ({ params }) => {
        if (!params.selectedRoomId) return of([] as RoomMemberInfo[]);
        const fn = httpsCallable<{ roomId: string }, { members: RoomMemberInfo[] }>(
          getFn(), 'getAllMembersFromRoom'
        );
        return from(
          fn({ roomId: params.selectedRoomId }).then(r => r.data.members ?? [])
        );
      },
    }),

    /** Details for the selected room (3rd column). */
    roomDetailsResource: rxResource({
      params: () => ({
        selectedRoomId: store.selectedRoomId(),
        detailsTarget: store.detailsTarget(),
      }),
      stream: ({ params }) => {
        if (!params.selectedRoomId || params.detailsTarget !== 'room') return of(undefined);
        const fn = httpsCallable<{ roomId: string }, RoomDetails>(getFn(), 'getRoomDetails');
        return from(fn({ roomId: params.selectedRoomId }).then(r => r.data));
      },
    }),

    /** Details for the selected member (3rd column). */
    memberDetailsResource: rxResource({
      params: () => ({
        selectedMemberId: store.selectedMemberId(),
        selectedRoomId: store.selectedRoomId(),
        detailsTarget: store.detailsTarget(),
      }),
      stream: ({ params }) => {
        if (!params.selectedMemberId || params.detailsTarget !== 'member') return of(undefined);
        const fn = httpsCallable<{ userId: string; roomId?: string }, MemberDetails>(
          getFn(), 'getMemberDetails'
        );
        return from(
          fn({ userId: params.selectedMemberId, roomId: params.selectedRoomId ?? undefined })
            .then(r => r.data)
        );
      },
    }),
  })),

  // ─── computed ───────────────────────────────────────────────────────────────
  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
    imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
    isLoadingRooms: computed(() => state.roomsResource.isLoading()),
    isLoadingMembers: computed(() => state.membersResource.isLoading()),
    rooms: computed(() => state.roomsResource.value() ?? []),
    members: computed(() => state.membersResource.value() ?? []),
    roomDetails: computed(() => state.roomDetailsResource.value()),
    memberDetails: computed(() => state.memberDetailsResource.value()),
    /**
     * roomId → number of room members without a membership, from the last guest scan.
     * Empty until `previewGuests()` has run — the room list then flags the drifted rooms
     * so the mismatch is visible where the member count is shown, not only in the card.
     */
    /** Another page of history exists exactly while Synapse still hands back a cursor. */
    historyHasMore: computed(() => !!state.historyCursor()),
    guestExtrasByRoom: computed(() => new Map(
      (state.guestPreview() ?? [])
        .filter(g => g.extras.length > 0)
        .map(g => [g.roomId, g.extras.length] as const)
    )),
  })),

  // ─── avatar resolution (mxc:// → authenticated blob URL) ─────────────────────
  withProps(store => ({
    // Resolve the selected member/room avatar for <img>. http/blob values pass through
    // unchanged; an mxc:// URI is fetched with the admin's Matrix access token and turned
    // into a cached blob URL by MatrixMediaService (the same path the room list uses).
    // Resolves to undefined when the Matrix client is not initialized — the view then
    // falls back to the person icon instead of a broken image.
    memberAvatarResource: rxResource({
      params: () => ({ url: store.memberDetails()?.avatarUrl }),
      stream: ({ params }) => {
        const url = params.url;
        if (!url) return of<string | undefined>(undefined);
        if (!url.startsWith('mxc://')) return of<string | undefined>(url);
        return from(store.media.resolveMediaUrl(url).then(b => b || undefined));
      },
    }),
    roomAvatarResource: rxResource({
      params: () => ({ url: store.roomDetails()?.avatarUrl }),
      stream: ({ params }) => {
        const url = params.url;
        if (!url) return of<string | undefined>(undefined);
        if (!url.startsWith('mxc://')) return of<string | undefined>(url);
        return from(store.media.resolveMediaUrl(url).then(b => b || undefined));
      },
    }),
    // Member-list avatars: resolve each mxc:// avatar to a blob URL so the list shows the
    // photo (isPhotoUrl accepts blob:) instead of an icon. MatrixMediaService caches, so
    // repeated members/rooms don't refetch. http/blob avatars pass through untouched.
    membersResolvedResource: rxResource({
      params: () => ({ members: store.members() }),
      stream: ({ params }) => from(Promise.all(params.members.map(async m => {
        if (!m.avatarUrl?.startsWith('mxc://')) return m;
        const blob = await store.media.resolveMediaUrl(m.avatarUrl);
        return { ...m, avatarUrl: blob || undefined };
      }))),
    }),
  })),
  withComputed(state => ({
    memberAvatarUrl: computed(() => state.memberAvatarResource.value()),
    roomAvatarUrl: computed(() => state.roomAvatarResource.value()),
    // Falls back to the raw members while resolution is in flight (icons, never broken).
    resolvedMembers: computed(() => state.membersResolvedResource.value() ?? state.members()),
  })),

  // ─── methods ────────────────────────────────────────────────────────────────
  withMethods(store => ({

    selectPerson(personKey: string | undefined): void {
      patchState(store, {
        selectedPersonKey: personKey || undefined,
        selectedRoomId: undefined,
        selectedMemberId: undefined,
        detailsTarget: undefined,
      });
    },

    selectRoom(roomId: string | undefined): void {
      patchState(store, {
        selectedRoomId: roomId,
        selectedMemberId: undefined,
        detailsTarget: undefined,
      });
    },

    showRoomDetails(roomId: string): void {
      patchState(store, { selectedRoomId: roomId, detailsTarget: 'room', selectedMemberId: undefined });
    },

    showRoomMembers(roomId: string): void {
      patchState(store, { selectedRoomId: roomId, detailsTarget: undefined, selectedMemberId: undefined });
    },

    showMemberDetails(userId: string): void {
      patchState(store, { selectedMemberId: userId, detailsTarget: 'member' });
    },

    // ─── read-only history ─────────────────────────────────────────────────────

    /**
     * Open a room's message history read-only.
     *
     * This is the admin's answer to a closed group chat: `requestGroupRoomAccess` refuses a
     * tenant admin who is not a member of a `chatMode: 'members'` group on purpose — it
     * force-joins, and the admin would appear in that room permanently and visibly. Reading
     * through the Synapse admin API changes no membership and leaves no trace in the room.
     *
     * The modal is imported dynamically: it injects this store back, and a static import
     * would make Ionic's overlay creation fail with an undefined provider.
     */
    async showRoomHistory(room: AdminRoom): Promise<void> {
      patchState(store, { history: [], historyRoomId: room.roomId, historyCursor: undefined });
      const opened = this.loadHistoryPage();
      const { ChatHistoryModal } = await import('./chat-history.modal');
      const modal = await store.modalController.create({
        component: ChatHistoryModal,
        componentProps: { roomName: room.name || room.derivedName || room.roomId },
      });
      await modal.present();
      await opened;
      await modal.onDidDismiss();
      // Drop the transcript on close: it is other people's conversation, and there is no
      // reason to keep it in memory once the admin has stopped looking at it.
      patchState(store, { history: [], historyRoomId: undefined, historyCursor: undefined });
    },

    /** Append the next page (further into the past). No-op at the start of the room. */
    async loadOlderHistory(): Promise<void> {
      if (!store.historyCursor() || store.historyLoading()) return;
      await this.loadHistoryPage();
    },

    async loadHistoryPage(): Promise<void> {
      const roomId = store.historyRoomId();
      if (!roomId) return;
      patchState(store, { historyLoading: true });
      try {
        const fn = httpsCallable<
          { roomId: string; limit: number; from?: string },
          { messages: RoomMessageInfo[]; end?: string }
        >(getFn(), 'getRoomMessages');
        const result = await fn({ roomId, limit: 50, from: store.historyCursor() });
        // Guard against a page arriving after the admin closed the modal or opened another
        // room: `historyRoomId` is the only thing that says which request this answer belongs to.
        if (store.historyRoomId() !== roomId) return;
        // Synapse returns the same `end` token at the start of the room; treating that as a
        // further page would loop the "load older" button forever.
        const end = result.data.end;
        patchState(store, {
          history: [...store.history(), ...(result.data.messages ?? [])],
          historyCursor: (result.data.messages ?? []).length > 0 ? end : undefined,
        });
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.chat_history_error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { historyLoading: false });
      }
    },

    // ─── room actions ──────────────────────────────────────────────────────────

    async renameRoom(roomId: string): Promise<void> {
      const alert = await store.alertController.create({
        header: store.i18n.chat_room_rename(),
        inputs: [{ 
          name: 'name', 
          type: 'text', 
          placeholder: store.i18n.chat_room_rename_newname() 
        }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_room_rename_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.name) return;
      const newName = (data.values.name as string).trim();
      if (!newName) return;
      try {
        const fn = httpsCallable<{ roomId: string; name: string }, { roomId: string; name: string }>(
          getFn(), 'renameMatrixRoom'
        );
        await fn({ roomId, name: newName });
        store.roomsResource.reload();
        await showToast(store.toastController, `${store.i18n.chat_room_rename_conf()}: ${newName}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    /**
     * The group document behind a room, or undefined for a DM / an unmatched room.
     * `allGroupsAndChats()` on purpose: `allGroups()` drops the ad-hoc chats, which are
     * exactly what the convert action is looking for.
     */
    groupOfRoom(room: AdminRoom): GroupModel | undefined {
      return findGroupOfRoom(store.appStore.allGroupsAndChats(), room.roomId, room.canonicalAlias);
    },

    /** Is this room an ad-hoc chat, i.e. can it be converted into a group? */
    isAdhocChatRoom(room: AdminRoom): boolean {
      const group = this.groupOfRoom(room);
      return !!group && (group.kind ?? 'group') === 'chat';
    },

    /**
     * Turn an ad-hoc chat into a real group.
     *
     * An ad-hoc chat IS a group document already (`kind: 'chat'`), with its members, its
     * `admins[]` and its Matrix room in place — what `createAdhocChat` never wrote is the CMS
     * page and section behind the group view's chat segment, which is why that segment 404s.
     * So this flips `kind`, turns on the sub-features the admin ticks, and creates the
     * documents the normal group-creation flow (`GroupStore.save`) would have created.
     *
     * Three things it deliberately does NOT touch:
     *  - the okey. `scs_c_anc37t5jy3` is baked into the room alias, the canonical-alias state
     *    event and every membership's `orgKey`. A prettier key would mean a new room and a lost
     *    history; legacy keys like `notfall` live with the same trade-off.
     *  - `chatMode: 'members'`, so the room stays closed to non-members.
     *  - `history_visibility: 'joined'` on the room, so someone joining the group later does not
     *    get to read back what was written while this was a private chat.
     *
     * Idempotent: every document is skipped if it already exists, so a run that failed halfway
     * can simply be repeated.
     */
    async convertAdhocChatToGroup(room: AdminRoom): Promise<void> {
      const group = this.groupOfRoom(room);
      if (!group || (group.kind ?? 'group') !== 'chat') return;

      const alert = await store.alertController.create({
        header: store.i18n.chat_convert_header(),
        message: store.i18n.chat_convert_message(),
        inputs: [
          { type: 'checkbox', name: 'hasCalendar', value: 'hasCalendar', label: store.i18n.chat_convert_calendar(), checked: true },
          { type: 'checkbox', name: 'hasContent', value: 'hasContent', label: store.i18n.chat_convert_content() },
          { type: 'checkbox', name: 'hasFiles', value: 'hasFiles', label: store.i18n.chat_convert_files() },
          { type: 'checkbox', name: 'hasTasks', value: 'hasTasks', label: store.i18n.chat_convert_tasks() },
        ],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_convert_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;
      // A checkbox alert hands back the VALUES of the ticked boxes, not a name→boolean map.
      const picked = new Set<string>(Array.isArray(data?.values) ? (data.values as string[]) : []);

      try {
        const user = store.appStore.currentUser();
        const tenantId = store.appStore.tenantId();
        const hasCalendar = picked.has('hasCalendar');
        const hasContent = picked.has('hasContent');
        const hasFiles = picked.has('hasFiles');

        // 1. the chat page + section — without these the group view's chat segment 404s
        const chatSectionKey = await this.ensureChatSection(group, tenantId, user);
        await this.ensureGroupPage(group, 'chat', store.i18n.chat_convert_page_chat(), tenantId, user, chatSectionKey);

        // 2. the optional content page with its intro article
        if (hasContent) {
          const articleKey = await this.ensureArticleSection(group, tenantId, user);
          await this.ensureGroupPage(group, 'content', store.i18n.chat_convert_page_content(), tenantId, user, articleKey);
        }

        // 3. the optional group calendar, owned by `group.<okey>` like every group calendar
        if (hasCalendar) await this.ensureGroupCalendar(group, tenantId, user);

        // 4. only now the group document itself: if any step above failed, the chat stays a
        //    chat and the admin can simply run the action again.
        const converted = {
          ...group,
          kind: 'group',
          hasMembers: true,
          hasChat: true,
          hasCalendar,
          hasContent,
          hasFiles,
          hasTasks: picked.has('hasTasks'),
          filesFolder: hasFiles ? `f_${group.okey}` : group.filesFolder,
        } as GroupModel;
        await store.firestoreService.updateModel<GroupModel>(GroupCollection, converted, false, undefined, undefined, user);

        await showToast(store.toastController, `${store.i18n.chat_convert_conf()}: ${group.name}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    // ─── convert: the documents GroupStore.save() would have created ─────────────
    //
    // These mirror `GroupStore.createChatSection` / `createArticleSection` /
    // `createGroupPage` / `createGroupCalendar`. They are duplicated rather than imported:
    // `@okr/subject-group-feature` would drag the whole group view (tasks, folder, document,
    // calendar) into the AOC chunk, which is exactly the eager-bundle growth the AOC page was
    // just trimmed of. Only the document shapes are copied, and those are model-defined.

    /** Read a document once; used to keep every create below idempotent. */
    async docExists(collection: string, key: string): Promise<boolean> {
      return !!(await firstValueFrom(store.firestoreService.readModel(collection, key)));
    },

    async ensureChatSection(group: GroupModel, tenantId: string, user: UserModel | undefined): Promise<string> {
      const key = `${group.okey}_chat`;
      if (await this.docExists(SectionCollection, key)) return key;
      const section = {
        okey: key,
        type: 'chat',
        name: key,
        title: store.i18n.chat_convert_page_chat(),
        subTitle: '',
        index: '',
        color: ColorIonic.Light,
        roleNeeded: 'registered',
        isArchived: false,
        content: { htmlContent: '<p></p>', colSize: 4, position: ViewPosition.None },
        properties: {
          description: '',
          id: `group-chat-${group.okey}`,
          name: group.name,
          showChannelList: true,
          type: 'messaging',
          url: '',
        },
        notes: '',
        tags: '',
        tenants: [tenantId],
      } as ChatSection;
      await store.firestoreService.createModel<ChatSection>(SectionCollection, section, undefined, undefined, user);
      return key;
    },

    async ensureArticleSection(group: GroupModel, tenantId: string, user: UserModel | undefined): Promise<string> {
      const key = `g-${group.okey}`;
      if (await this.docExists(SectionCollection, key)) return key;
      const section = {
        okey: key,
        type: 'article',
        state: 'published',
        name: `group-intro-${group.okey}`,
        title: group.name,
        subTitle: '',
        index: '',
        color: ColorIonic.Light,
        colSize: '12',
        roleNeeded: 'groupAdmin',
        isArchived: false,
        content: { htmlContent: '<p></p>', colSize: 3, position: ViewPosition.None },
        // The full imageStyle matters: Firestore hands reads back as plain objects, so a
        // field missing here stays undefined on the section forever (no model defaults).
        properties: {
          images: [],
          imageStyle: {
            imgIxParams: '',
            width: '100%',
            height: 'auto',
            sizes: '(max-width: 786px) 50vw, 100vw',
            border: '1px',
            borderRadius: '4px',
            isThumbnail: false,
            slot: 'none',
            fill: false,
            hasPriority: false,
            action: ImageActionType.None,
            zoomFactor: 2,
          },
        },
        notes: '',
        tags: '',
        tenants: [tenantId],
      } as ArticleSection;
      await store.firestoreService.createModel<ArticleSection>(SectionCollection, section, undefined, undefined, user);
      return key;
    },

    async ensureGroupPage(
      group: GroupModel, postfix: string, name: string,
      tenantId: string, user: UserModel | undefined, sectionKey?: string,
    ): Promise<void> {
      const key = `${group.okey}_${postfix}`;
      if (await this.docExists(PageCollection, key)) return;
      const page = new PageModel(tenantId);
      page.okey = key;
      page.name = name;
      page.type = postfix;
      page.state = 'published';
      if (sectionKey) page.sections = [sectionKey];
      await store.firestoreService.createModel<PageModel>(PageCollection, page, undefined, undefined, user);
    },

    async ensureGroupCalendar(group: GroupModel, tenantId: string, user: UserModel | undefined): Promise<void> {
      if (await this.docExists(CalendarCollection, group.okey)) return;
      const cal = new CalendarModel(tenantId);
      cal.okey = group.okey;
      cal.name = group.name;
      cal.description = group.name;
      cal.owner = `${GroupModelName}.${group.okey}`;
      await store.firestoreService.createModel<CalendarModel>(CalendarCollection, cal, undefined, undefined, user);
    },

    async deleteRoom(roomId: string): Promise<void> {
      const message = await firstValueFrom(store.i18nService.translate('@aoc/feature.' + 'chat.room.delete.confirm', { roomId }));
      const alert = await store.alertController.create({
        header: store.i18n.chat_room_delete(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_room_delete_action(), role: 'confirm', cssClass: 'danger' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;
      try {
        const fn = httpsCallable<{ roomId: string }, { deleteId: string }>(getFn(), 'deleteMatrixRoom');
        await fn({ roomId });
        if (store.selectedRoomId() === roomId) {
          patchState(store, { selectedRoomId: undefined, detailsTarget: undefined });
        }
        store.roomsResource.reload();
        await showToast(store.toastController, store.i18n.chat_room_delete_conf());
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async addAlias(roomId: string): Promise<void> {
      const alert = await store.alertController.create({
        header: store.i18n.chat_alias_add(),
        inputs: [{ name: 'alias', type: 'text', placeholder: store.i18n.chat_alias_add_placeholder() }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_alias_add_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.alias) return;
      const aliasName = (data.values.alias as string).trim();
      if (!aliasName) return;
      try {
        const fn = httpsCallable<{ roomId: string; aliasName: string }, { alias: string }>(
          getFn(), 'addMatrixRoomAlias'
        );
        const result = await fn({ roomId, aliasName });
        await showToast(store.toastController, `${store.i18n.chat_alias_add_conf()}: ${result.data.alias}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async inviteToRoom(roomId: string): Promise<void> {
      const defaultPersonKey = store.selectedPersonKey() ?? '';
      const alert = await store.alertController.create({
        header: store.i18n.chat_room_invite(),
        inputs: [{ name: 'personKey', type: 'text', value: defaultPersonKey, placeholder: 'personKey' }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_room_invite_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.personKey) return;
      const pk = (data.values.personKey as string).trim();
      if (!pk) return;
      try {
        const fn = httpsCallable<{ roomId: string; personKey: string }, { invited: boolean }>(
          getFn(), 'invitePersonToGroupRoom'
        );
        await fn({ roomId, personKey: pk });
        store.membersResource.reload();
        await showToast(store.toastController, `${pk} ${store.i18n.chat_room_invite_conf()}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async provisionUser(personKey?: string): Promise<void> {
      const defaultKey = personKey ?? store.selectedPersonKey() ?? '';
      const alert = await store.alertController.create({
        header: store.i18n.chat_user_provision(),
        inputs: [{ name: 'personKey', type: 'text', value: defaultKey, placeholder: 'personKey' }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_user_provision_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.personKey) return;
      const pk = (data.values.personKey as string).trim();
      if (!pk) return;
      try {
        const fn = httpsCallable<{ personKey: string }, { matrixUserId: string; provisioned: boolean }>(
          getFn(), 'provisionMatrixUser'
        );
        const result = await fn({ personKey: pk });
        await showToast(store.toastController, `${store.i18n.chat_user_provision_conf()}: ${result.data.matrixUserId}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    /**
     * Dry-run the display-name repair (SCS-13): scans all Matrix accounts and stores
     * the list of accounts whose display name would be set from the linked person's
     * real name. Shows the result in the repair card without writing anything.
     */
    async previewDisplayNameRepair(): Promise<void> {
      patchState(store, { repairScanning: true });
      try {
        const fn = httpsCallable<{ dryRun?: boolean }, DisplayNameRepairResult>(
          getFn(), 'repairMatrixDisplayNames'
        );
        const dry = await fn({ dryRun: true });
        patchState(store, {
          repairPreview: dry.data.repaired,
          repairSkippedCustom: dry.data.skippedCustomName.length,
        });
      } catch (e) {
        patchState(store, { repairPreview: undefined, repairSkippedCustom: 0 });
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { repairScanning: false });
      }
    },

    /**
     * Apply the previewed display-name repair. Confirms, then re-runs the scan with
     * dryRun=false so the applied set reflects the current state at write time.
     */
    async applyDisplayNameRepair(): Promise<void> {
      const preview = store.repairPreview();
      if (!preview || preview.length === 0) return;
      const message = await firstValueFrom(
        store.i18nService.translate('@aoc/feature.chat.repair.names.confirm', { count: preview.length })
      );
      const alert = await store.alertController.create({
        header: store.i18n.chat_repair_names(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_repair_names_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      patchState(store, { repairApplying: true });
      try {
        const fn = httpsCallable<{ dryRun?: boolean }, DisplayNameRepairResult>(
          getFn(), 'repairMatrixDisplayNames'
        );
        const applied = await fn({ dryRun: false });
        const conf = await firstValueFrom(
          store.i18nService.translate('@aoc/feature.chat.repair.names.conf', { count: applied.data.repaired.length })
        );
        patchState(store, { repairPreview: [], repairSkippedCustom: applied.data.skippedCustomName.length });
        store.membersResource.reload();
        await showToast(store.toastController, conf);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { repairApplying: false });
      }
    },

    /**
     * Dry-run the avatar repair: scans all Matrix accounts and stores the list of
     * accounts that have no avatar and would receive the person's avatar
     * (avatars/person.<key>). Writes nothing.
     */
    async previewAvatarRepair(): Promise<void> {
      patchState(store, { avatarRepairScanning: true });
      try {
        const fn = httpsCallable<{ dryRun?: boolean }, AvatarRepairResult>(
          getFn(), 'repairMatrixAvatars'
        );
        const dry = await fn({ dryRun: true });
        patchState(store, {
          // Both blank-fills and legacy-https→mxc migrations will change; show them together.
          avatarRepairPreview: [...dry.data.repaired, ...dry.data.migratedHttp],
          avatarRepairSkippedHas: dry.data.skippedHasAvatar,
        });
      } catch (e) {
        patchState(store, { avatarRepairPreview: undefined, avatarRepairSkippedHas: 0 });
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { avatarRepairScanning: false });
      }
    },

    /**
     * Apply the previewed avatar repair. Confirms, then re-runs the scan with
     * dryRun=false so the applied set reflects the current state at write time.
     */
    async applyAvatarRepair(): Promise<void> {
      const preview = store.avatarRepairPreview();
      if (!preview || preview.length === 0) return;
      const message = await firstValueFrom(
        store.i18nService.translate('@aoc/feature.chat.repair.avatars.confirm', { count: preview.length })
      );
      const alert = await store.alertController.create({
        header: store.i18n.chat_repair_avatars(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_repair_avatars_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      patchState(store, { avatarRepairApplying: true });
      try {
        const fn = httpsCallable<{ dryRun?: boolean }, AvatarRepairResult>(
          getFn(), 'repairMatrixAvatars'
        );
        const applied = await fn({ dryRun: false });
        const conf = await firstValueFrom(
          store.i18nService.translate('@aoc/feature.chat.repair.avatars.conf', { count: applied.data.repaired.length + applied.data.migratedHttp.length })
        );
        patchState(store, { avatarRepairPreview: [], avatarRepairSkippedHas: applied.data.skippedHasAvatar });
        store.membersResource.reload();
        await showToast(store.toastController, conf);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { avatarRepairApplying: false });
      }
    },

    // ─── tenant backfill ───────────────────────────────────────────────────────

    /**
     * Dry-run the tenant backfill: lists the rooms that would be stamped with the tenants
     * they belong to (`org.okr.tenant` room state). Writes nothing.
     */
    async previewTenantRepair(): Promise<void> {
      patchState(store, { tenantRepairScanning: true });
      try {
        const fn = httpsCallable<{ dryRun?: boolean }, TenantBackfillResult>(
          getFn(), 'backfillMatrixRoomTenants'
        );
        const dry = await fn({ dryRun: true });
        patchState(store, {
          tenantRepairPreview: Object.entries(dry.data.changes)
            .map(([roomId, tenants]) => ({ roomId, name: dry.data.names?.[roomId] ?? '', tenants })),
          tenantRepairAmbiguous: dry.data.ambiguous.length,
        });
      } catch (e) {
        patchState(store, { tenantRepairPreview: undefined, tenantRepairAmbiguous: 0 });
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { tenantRepairScanning: false });
      }
    },

    /**
     * Apply the previewed tenant backfill. Confirms, then re-runs with dryRun=false so the
     * written set reflects the state at write time. Idempotent — already-marked rooms are
     * skipped server-side, so re-running only picks up what is new.
     */
    async applyTenantRepair(): Promise<void> {
      const preview = store.tenantRepairPreview();
      if (!preview || preview.length === 0) return;
      const message = await firstValueFrom(
        store.i18nService.translate('@aoc/feature.chat.repair.tenants.confirm', { count: preview.length })
      );
      const alert = await store.alertController.create({
        header: store.i18n.chat_repair_tenants(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_repair_tenants_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      patchState(store, { tenantRepairApplying: true });
      try {
        const fn = httpsCallable<{ dryRun?: boolean }, TenantBackfillResult>(
          getFn(), 'backfillMatrixRoomTenants'
        );
        const applied = await fn({ dryRun: false });
        const conf = await firstValueFrom(
          store.i18nService.translate('@aoc/feature.chat.repair.tenants.conf', { count: applied.data.stamped })
        );
        patchState(store, { tenantRepairPreview: [], tenantRepairAmbiguous: applied.data.ambiguous.length });
        await showToast(store.toastController, conf);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { tenantRepairApplying: false });
      }
    },

    // ─── group-room member reconciliation ──────────────────────────────────────

    /**
     * Force-join every person with an active group membership into their group's Matrix
     * room, for all groups of this tenant.
     *
     * There is no dry run: reconcileGroupRoomMembers is additive-only — it joins missing
     * members and merely *reports* room members without a membership (course participants
     * are legitimate), so applying it can never remove anyone.
     *
     * Needed after the 2026-08-13 fix to grantsChatAccess, which used to treat a FUTURE
     * membership exit date as already-inactive and kicked those members from their group
     * rooms months early. Those members are not restored automatically.
     */
    async applyMemberRepair(): Promise<void> {
      const groups = store.appStore.allGroups();
      const message = await firstValueFrom(
        store.i18nService.translate('@aoc/feature.chat.repair.members.confirm', { count: groups.length })
      );
      const alert = await store.alertController.create({
        header: store.i18n.chat_repair_members(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_repair_members_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      patchState(store, { memberRepairApplying: true, memberRepairJoined: 0 });
      try {
        const fn = httpsCallable<{ groupId: string }, { roomId: string; joined: string[]; alreadyIn: string[]; extras: string[] }>(
          getFn(), 'reconcileGroupRoomMembers'
        );
        let joined = 0;
        for (const group of groups) {
          try {
            const result = await fn({ groupId: group.okey });
            joined += result.data.joined.length;
          } catch (e) {
            // A group without a chat room throws; that is expected, not a failure of the run.
            console.warn(`reconcileGroupRoomMembers: skipped group ${group.okey}: ${(e as Error).message}`);
          }
        }
        patchState(store, { memberRepairJoined: joined });
        await showToast(store.toastController, `${store.i18n.chat_repair_members()}: ${joined}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { memberRepairApplying: false });
      }
    },

    // ─── group-room write-permission sync ──────────────────────────────────────

    /**
     * Re-apply each group's write-permission setting to its Matrix chat room.
     *
     * Losing a privileged role does not immediately revoke the ability to post in a
     * group's announcement-style room — a nightly job removes it. This lets an admin
     * trigger the same reconciliation on demand, for all groups of this tenant.
     */
    async applyPostPolicySync(): Promise<void> {
      // Nur Gruppen mit 'privileged' koennen ueberhaupt etwas zu tun haben — 'all'-Gruppen
      // werden von applyRoomPostPolicy ohne allowReset gar nicht mehr angefasst (Finding 1),
      // also braeuchte ein Lauf ueber alle 36 Gruppen nur unnoetig Zeit und Raum-Beitritte.
      const groups = store.appStore.allGroups().filter(g => g.postPolicy === 'privileged');
      const message = await firstValueFrom(
        store.i18nService.translate('@aoc/feature.chat.repair.postpolicy.confirm', { count: groups.length })
      );
      const alert = await store.alertController.create({
        header: store.i18n.chat_repair_postpolicy(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_repair_postpolicy_action(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      patchState(store, { postPolicySyncApplying: true, postPolicySyncChanged: 0 });
      try {
        const fn = httpsCallable<{ groupId: string }, { result: 'unchanged' | 'applied' | 'no-room' }>(
          getFn(), 'syncRoomPostPolicy'
        );
        let changed = 0;
        for (const group of groups) {
          try {
            const result = await fn({ groupId: group.okey });
            if (result.data.result === 'applied') changed++;
          } catch (e) {
            // A group without a chat room throws; that is expected, not a failure of the run.
            console.warn(`syncRoomPostPolicy: skipped group ${group.okey}: ${(e as Error).message}`);
          }
        }
        patchState(store, { postPolicySyncChanged: changed });
        await showToast(store.toastController, `${store.i18n.chat_repair_postpolicy()}: ${changed}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { postPolicySyncApplying: false });
      }
    },

    // ─── group-room drift: non-members sitting in a group chat ─────────────────

    /**
     * Scan every group room of this tenant and report who is in it without holding an
     * active membership. Read-only — nothing changes until `pruneGuests` is called for
     * one specific group.
     */
    async previewGuests(): Promise<void> {
      patchState(store, { guestScanning: true });
      try {
        const fn = httpsCallable<{ tenantId: string }, { groups: GroupRoomDrift[] }>(
          getFn(), 'auditGroupRoomMembers'
        );
        const { data } = await fn({ tenantId: store.appStore.tenantId() });
        // Only groups that actually disagree are worth showing; the rest are noise.
        const drifted = data.groups
          .filter(g => g.extras.length > 0 || g.missing.length > 0)
          .sort((a, b) => b.extras.length - a.extras.length);
        patchState(store, { guestPreview: drifted });
      } catch (e) {
        patchState(store, { guestPreview: undefined });
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { guestScanning: false });
      }
    },

    /**
     * Remove the non-members of ONE group from its chat room. Per group rather than
     * "clean everything": a group may legitimately host non-members (course participants),
     * so who gets removed stays a deliberate, per-group decision.
     *
     * The Cloud Function re-verifies every user id against the current memberships, so a
     * preview that went stale between scan and apply can never remove a real member.
     */
    async pruneGuests(drift: GroupRoomDrift): Promise<void> {
      if (drift.extras.length === 0) return;
      const message = await firstValueFrom(
        store.i18nService.translate('@aoc/feature.chat.repair.guests.confirm', {
          count: drift.extras.length,
          group: drift.groupName,
        })
      );
      const alert = await store.alertController.create({
        header: store.i18n.chat_repair_guests(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_repair_guests_action(), role: 'confirm', cssClass: 'danger' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      patchState(store, { guestPruningGroup: drift.groupKey });
      try {
        const fn = httpsCallable<{ groupId: string; userIds: string[] }, { roomId: string; kicked: string[]; refused: string[] }>(
          getFn(), 'pruneGroupRoomExtras'
        );
        const { data } = await fn({ groupId: drift.groupKey, userIds: drift.extras.map(e => e.userId) });
        // Drop the removed people from the preview so the card reflects the new state
        // without a second full scan; a group with nothing left over disappears.
        const kicked = new Set(data.kicked);
        const remaining = (store.guestPreview() ?? [])
          .map(g => g.groupKey === drift.groupKey
            ? { ...g, extras: g.extras.filter(e => !kicked.has(e.userId)), roomMemberCount: g.roomMemberCount - kicked.size }
            : g)
          .filter(g => g.extras.length > 0 || g.missing.length > 0);
        patchState(store, { guestPreview: remaining });

        const confirmation = await firstValueFrom(
          store.i18nService.translate('@aoc/feature.chat.repair.guests.conf', { count: data.kicked.length })
        );
        await showToast(store.toastController, confirmation);
        store.roomsResource.reload();
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      } finally {
        patchState(store, { guestPruningGroup: undefined });
      }
    },

    // ─── member actions ────────────────────────────────────────────────────────

    async kickMember(userId: string, roomId: string): Promise<void> {
      const message = await firstValueFrom(store.i18nService.translate('@aoc/feature.' + 'chat.member.kick.confirm', { userId }));
      const alert = await store.alertController.create({
        header: store.i18n.chat_member_kick(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_member_kick_action(), role: 'confirm', cssClass: 'danger' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      // Extract personKey from userId (@personkey:homeserver → personkey)
      const personKey = userId.replace(/^@/, '').split(':')[0];
      try {
        const fn = httpsCallable<{ roomId: string; personKey: string }, { kicked: boolean }>(
          getFn(), 'kickPersonFromGroupRoom'
        );
        await fn({ roomId, personKey });
        store.membersResource.reload();
        await showToast(store.toastController, `${userId} ${store.i18n.chat_member_kick_conf()}`);
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    async deactivateUser(userId: string): Promise<void> {
      const message = await firstValueFrom(store.i18nService.translate('@aoc/feature.' + 'chat.user.deactivate.confirm', { userId }));
      const alert = await store.alertController.create({
        header: store.i18n.chat_user_deactivate(),
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.chat_user_deactivate_action(), role: 'confirm', cssClass: 'danger' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      const personKey = userId.replace(/^@/, '').split(':')[0];
      try {
        const fn = httpsCallable<{ personKey: string; erase?: boolean }, { matrixUserId: string; deactivated: boolean }>(
          getFn(), 'deactivateMatrixUser'
        );
        const result = await fn({ personKey });
        store.roomsResource.reload();
        store.membersResource.reload();
        await showToast(store.toastController, result.data.deactivated ? `${userId} ${store.i18n.chat_user_deactivate_conf()}` : store.i18n.chat_user_deactivate_notfound());
      } catch (e) {
        await showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);
      }
    },

    /** Set the matrix-js-sdk console log level (admin-only, persisted across reloads). */
    setLogLevel(level: MatrixLogLevel): void {
      setMatrixLogLevel(level);
      patchState(store, { logLevel: level });
    },

    reloadRooms(): void {
      store.roomsResource.reload();
    },

    reloadMembers(): void {
      store.membersResource.reload();
    },
  }))
);
