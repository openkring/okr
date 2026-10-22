import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonAvatar, IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, ModalController,
} from '@ionic/angular';

import { GroupModel } from '@okr/shared-models';
import { Header, ImgDirective } from '@okr/shared-ui';
import { MultiAvatarPipe, SvgIconPipe } from '@okr/shared-pipes';
import { AlertService, dismissOverlay, navigateByUrl } from '@okr/shared-util-angular';
import { fill, getAvatarInfo } from '@okr/shared-util-core';
import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { AvatarPipe } from '@okr/avatar-ui';
import { ADHOC_CHAT_MAX_MEMBERS, hashUserIdToColor, isMatrixPhotoUrl, PIN_ICON, RoomKind } from '@okr/chat-util';

import { MatrixChatStore } from './matrix-chat.store';
import { ChatHelpModal } from './chat-help.modal';
import type { RoomDetailsMember } from './room-details.feature';

/**
 * Chat-Details (spec 1.109 §8): opened by tapping the room name. Hero, tiles (Stumm · Angeheftet ·
 * Hilfe), the type-specific section (pinboard rules, notes / ad-hoc hints, link to the group),
 * the members and the bottom rows (Ausblenden · Chat archivieren · Chat verlassen).
 *
 * What is shown follows `store.currentRoomDetails()` (= `getRoomDetailsSections`) alone; the
 * flows live in `room-details.feature.ts`. Opened by the store with a dynamic import, because
 * this modal injects the store back.
 */
@Component({
  selector: 'okr-chat-room-details-modal',
  standalone: true,
  imports: [
    Header, ImgDirective, AvatarPipe, MultiAvatarPipe, SvgIconPipe,
    IonContent, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonAvatar, IonButton, IonIcon,
  ],
  styles: [`
    .hero { display: flex; flex-direction: column; align-items: center; padding: 24px 16px 8px 16px; text-align: center; }
    .hero-avatar { width: 88px; height: 88px; border-radius: 50%; overflow: hidden; display: flex; align-items: center;
      justify-content: center; background: var(--ion-color-light); }
    .hero-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .hero-avatar ion-icon { font-size: 52px; }
    .hero-name { font-size: 1.3rem; font-weight: 600; margin-top: 12px; }
    .hero-type { color: var(--ion-color-medium); margin-top: 4px; font-size: 0.9rem; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 8px; padding: 12px 16px; }
    .tile { --padding-top: 10px; --padding-bottom: 10px; height: auto; margin: 0; text-transform: none; }
    .tile-inner { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 0.85rem; }
    .tile-inner ion-icon { font-size: 24px; }
    .text { display: block; padding: 8px 16px; white-space: pre-line; }
    .avatar-initial { width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-weight: 600; color: #fff; }
    .bottom { margin-top: 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.details_title() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if (room(); as room) {
        <!-- Hero -->
        <div class="hero">
          <div class="hero-avatar">
            @if (kind() === 'notes') {
              <ion-icon src="{{ 'text' | svgIcon }}" />
            } @else if (room.avatar && isPhotoUrl(room.avatar)) {
              <img [src]="room.avatar" [alt]="roomName()" />
            } @else {
              <ion-icon src="{{ room | multiAvatar | svgIcon }}" />
            }
          </div>
          <div class="hero-name">{{ roomName() }}</div>
          <div class="hero-type">{{ typeLine() }}</div>
        </div>

        <!-- Tiles -->
        @if (sections(); as sections) {
          <div class="tiles">
            @for (tile of sections.tiles; track tile) {
              @switch (tile) {
                @case ('mute') {
                  <ion-button class="tile" fill="outline" [color]="muted() ? 'primary' : 'medium'" (click)="mute()">
                    <span class="tile-inner"><ion-icon src="{{ (muted() ? 'notifications-off' : 'notifications-on') | svgIcon }}" />{{ muted() ? i18n.mute_on() : i18n.mute_tile() }}</span>
                  </ion-button>
                }
                @case ('pins') {
                  <ion-button class="tile" fill="outline" color="medium" (click)="openPins()">
                    <span class="tile-inner"><ion-icon src="{{ pinIcon | svgIcon }}" />{{ pinsLabel() }}</span>
                  </ion-button>
                }
                @case ('help') {
                  <ion-button class="tile" fill="outline" color="medium" (click)="openHelp()">
                    <span class="tile-inner"><ion-icon src="{{ 'help-circle' | svgIcon }}" />{{ i18n.details_help() }}</span>
                  </ion-button>
                }
              }
            }
          </div>

          <!-- Type-specific section -->
          @switch (kind()) {
            @case ('pinboard') {
              @if (group(); as pinboard) {
                @if (pinboard.notes) { <ion-note class="text">{{ pinboard.notes }}</ion-note> }
                <ion-note class="text" color="dark">{{ pinboard.allowReplyAll ? i18n.pinboard_info_rules_replyAll() : i18n.pinboard_info_rules() }}</ion-note>
                <ion-list lines="full">
                  <ion-item>
                    <ion-label>{{ i18n.pinboard_sources_title() }}</ion-label>
                    <ion-note slot="end">{{ sourceGroupNames().join(', ') }}</ion-note>
                  </ion-item>
                  <ion-item>
                    <ion-label>{{ i18n.pinboard_joinMode_label() }}</ion-label>
                    <ion-note slot="end">{{ pinboard.joinMode === 'optIn' ? i18n.pinboard_joinMode_optIn() : i18n.pinboard_joinMode_optOut() }}</ion-note>
                  </ion-item>
                  @if (canEditPinboard()) {
                    <ion-item button detail="false" (click)="editPinboard(pinboard)">
                      <ion-icon slot="start" color="primary" src="{{ 'edit' | svgIcon }}" />
                      <ion-label color="primary">{{ i18n.pinboard_edit() }}</ion-label>
                    </ion-item>
                  }
                </ion-list>
              }
            }
            @case ('notes') { <ion-note class="text">{{ i18n.notes_room_info() }}</ion-note> }
            @case ('adhoc') { <ion-note class="text">{{ i18n.adhoc_history_hint() }}</ion-note> }
            @case ('group') {
              @if (group(); as g) {
                <ion-list lines="full">
                  <ion-item button (click)="openGroup(g)">
                    <ion-icon slot="start" src="{{ 'group' | svgIcon }}" />
                    <ion-label>{{ i18n.details_group() }}<p>{{ g.name }}</p></ion-label>
                  </ion-item>
                </ion-list>
              }
            }
          }

          <!-- Members -->
          @if (sections.members !== 'none') {
            <ion-list lines="full">
              <ion-list-header><ion-label>{{ i18n.details_members() }} · {{ listedMembers().length }}</ion-label></ion-list-header>
              @if (sections.canInvite && canInviteMore()) {
                <ion-item button detail="false" [disabled]="busy()" (click)="invite()">
                  <ion-icon slot="start" color="primary" src="{{ 'person-add' | svgIcon }}" />
                  <ion-label color="primary">{{ i18n.details_invite() }}</ion-label>
                </ion-item>
              }
              @for (m of listedMembers(); track m.userId) {
                <ion-item>
                  <ion-avatar slot="start">
                    @if (m.personKey) {
                      <img okrImg src="{{ 'person.' + m.personKey | avatar }}" [alt]="m.name" />
                    } @else {
                      <div class="avatar-initial" [style.background-color]="color(m.userId)">{{ m.name.charAt(0).toUpperCase() }}</div>
                    }
                  </ion-avatar>
                  <ion-label>{{ m.name }}</ion-label>
                  @if (m.isSelf) {
                    <ion-note slot="end">{{ i18n.adhoc_member_you() }}</ion-note>
                  } @else if (sections.canRemoveMembers && m.personKey) {
                    <ion-button slot="end" fill="clear" color="danger" [disabled]="busy()" [attr.aria-label]="m.name" (click)="remove(m)">
                      <ion-icon slot="icon-only" src="{{ 'remove-circle' | svgIcon }}" />
                    </ion-button>
                  }
                </ion-item>
              }
            </ion-list>
          }

          <!-- Bottom rows -->
          @if (sections.hide || sections.archive || sections.archiveViaGroup || sections.leave) {
            <ion-list lines="full" class="bottom">
              @if (sections.hide) {
                <ion-item button detail="false" [disabled]="busy()" (click)="hide()">
                  <ion-icon slot="start" src="{{ 'eye-off' | svgIcon }}" />
                  <ion-label>{{ i18n.details_hide() }}</ion-label>
                </ion-item>
              }
              @if (sections.archive) {
                <ion-item button detail="false" [disabled]="busy()" (click)="archive()">
                  <ion-icon slot="start" src="{{ 'archive' | svgIcon }}" />
                  <ion-label>{{ i18n.details_archive() }}</ion-label>
                </ion-item>
              } @else if (sections.archiveViaGroup) {
                <ion-item>
                  <ion-icon slot="start" color="medium" src="{{ 'archive' | svgIcon }}" />
                  <ion-label color="medium">{{ i18n.details_archive_group() }}</ion-label>
                </ion-item>
              }
              @if (sections.leave) {
                <ion-item button detail="false" [disabled]="busy()" (click)="leave()">
                  <ion-icon slot="start" color="danger" src="{{ 'logout' | svgIcon }}" />
                  <ion-label color="danger">{{ i18n.details_leave() }}</ion-label>
                </ion-item>
              }
            </ion-list>
          }
        }
      }
    </ion-content>
  `,
})
export class ChatRoomDetailsModal {
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);
  private readonly appStore = inject(AppStore);
  protected readonly store = inject(MatrixChatStore);
  protected readonly i18n = this.store.i18n;
  protected readonly pinIcon = PIN_ICON;

  protected readonly room = this.store.currentRoom;
  protected readonly kind = computed((): RoomKind | undefined => this.store.currentRoomKind());
  protected readonly sections = this.store.currentRoomDetails;
  protected readonly group = this.store.currentRoomGroup;
  protected readonly muted = this.store.isCurrentRoomMuted;
  protected readonly busy = signal(false);

  /** Members invited / removed here, until the Matrix sync shows the change. */
  private readonly added = signal<RoomDetailsMember[]>([]);
  private readonly removed = signal<ReadonlySet<string>>(new Set());

  protected readonly roomName = computed(() =>
    this.kind() === 'notes' ? this.i18n.notes_room_name() : (this.room()?.name ?? ''));

  /** Joined members of the Matrix room, plus those invited / minus those removed here meanwhile. */
  private readonly members = computed((): RoomDetailsMember[] => {
    const joined = this.store.currentRoomMembers();
    const extra = this.added().filter((a) => !joined.some((j) => j.personKey === a.personKey));
    return [...joined, ...extra].filter((m) => !this.removed().has(m.personKey));
  });

  /** DM: only the counterpart; otherwise all members. */
  protected readonly listedMembers = computed((): RoomDetailsMember[] =>
    this.sections()?.members === 'counterpart' ? this.members().filter((m) => !m.isSelf) : this.members());

  protected readonly canInviteMore = computed(() => this.members().length < ADHOC_CHAT_MAX_MEMBERS);

  protected readonly typeLine = computed((): string => {
    const label = this.typeLabel();
    if (this.kind() === 'notes') return label;
    const n = this.members().length;
    const count = n === 1 ? this.i18n.details_persons_one() : fill(this.i18n.details_persons(), { n });
    return `${label} · ${count}`;
  });

  private readonly typeLabel = computed((): string => {
    switch (this.kind()) {
      case 'dm': return this.i18n.adhoc_roomType_direct();
      case 'adhoc': return this.i18n.adhoc_roomType_adhoc();
      case 'pinboard': return this.i18n.adhoc_roomType_pinboard();
      case 'group': return this.i18n.details_type_group();
      case 'notes': return this.i18n.details_type_notes();
      case 'support': return this.i18n.details_type_support();
      default: return this.i18n.details_type_other();
    }
  });

  protected readonly pinsLabel = computed(() => fill(this.i18n.details_pins(), { n: this.store.currentPins().length }));

  protected readonly sourceGroupNames = computed((): string[] => {
    const groups = this.appStore.allGroups();
    return (this.group()?.sourceGroupKeys ?? []).map((k: string) => groups.find((g: GroupModel) => g.okey === k)?.name ?? k);
  });

  /** Editing a pinboard stays with `privileged` (as before); archiving is a bottom row. */
  protected readonly canEditPinboard = computed(() => !!this.store.currentRoomDetailsCtx()?.isPrivileged);

  protected isPhotoUrl(url: string): boolean {
    return isMatrixPhotoUrl(url);
  }

  protected color(userId: string): string {
    return hashUserIdToColor(userId);
  }

  // ---- tiles ----

  protected async mute(): Promise<void> {
    const roomId = this.room()?.roomId;
    if (roomId) await this.store.pickRoomMute(roomId);
  }

  protected async openPins(): Promise<void> {
    await this.close();
    await this.store.openPinnedList();
  }

  protected async openHelp(): Promise<void> {
    const modal = await this.modalController.create({ component: ChatHelpModal });
    await modal.present();
  }

  // ---- type section ----

  protected async editPinboard(pinboard: GroupModel): Promise<void> {
    await this.store.editPinboard(pinboard);
  }

  protected async openGroup(group: GroupModel): Promise<void> {
    await this.close();
    await navigateByUrl(this.router, `/group/${group.okey}`);
  }

  // ---- members ----

  protected async invite(): Promise<void> {
    const group = this.group();
    const currentUser = this.appStore.currentUser();
    if (!group || !currentUser || this.busy()) return;
    const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: 'list-modal',
      componentProps: { selectedTag: '', currentUser },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<PersonSelectResult>();
    if (role !== 'confirm' || data?.kind !== 'predefined') return;
    const avatar = getAvatarInfo(data.person, 'person');
    if (!avatar || this.members().some((m) => m.personKey === avatar.key)) return;   // already in

    this.busy.set(true);
    try {
      const added = await this.store.matrixService.addAdhocChatMembers(group.okey, [avatar.key]);
      if (added.includes(avatar.key)) {
        const name = `${avatar.name1} ${avatar.name2}`.trim();
        this.removed.update((s) => new Set([...s].filter((k) => k !== avatar.key)));
        this.added.update((list) => [...list, { userId: `pending:${avatar.key}`, personKey: avatar.key, name, isSelf: false }]);
        await this.alertService.showToast(fill(this.i18n.adhoc_member_add_conf(), { name }));
      }
    } catch (error) {
      console.error('ChatRoomDetailsModal.invite: failed:', error);
      await this.alertService.showToast(this.i18n.adhoc_member_add_error());
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(member: RoomDetailsMember): Promise<void> {
    if (this.busy() || member.isSelf || !member.personKey) return;
    this.busy.set(true);
    try {
      if (await this.store.removeAdhocMember(member.personKey, member.name)) {
        this.added.update((list) => list.filter((m) => m.personKey !== member.personKey));
        this.removed.update((s) => new Set([...s, member.personKey]));
      }
    } finally {
      this.busy.set(false);
    }
  }

  // ---- bottom rows ----

  protected async hide(): Promise<void> {
    await this.run(() => this.store.hideCurrentRoom());
  }

  protected async archive(): Promise<void> {
    await this.run(() => this.store.archiveCurrentRoom());
  }

  protected async leave(): Promise<void> {
    await this.run(() => this.store.leaveCurrentRoom());
  }

  /** Runs a bottom-row flow; when the room is gone the page closes (the chat shows the room list). */
  private async run(flow: () => Promise<boolean>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      if (await flow()) await this.close();
    } finally {
      this.busy.set(false);
    }
  }

  private async close(): Promise<void> {
    await dismissOverlay(this.modalController);
  }
}
