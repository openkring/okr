import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ActionSheetOptions, IonBadge, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSpinner, IonThumbnail } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { Header } from '@bk2/shared-ui';
import { ModelSelectService } from '@bk2/shared-feature';
import { AvatarInfo } from '@bk2/shared-models';
import { AvatarSelect } from '@bk2/avatar-ui';

import { formatMatrixTimestamp, isMatrixPhotoUrl } from '@bk2/chat-util';
import { AocChatStore, AdminRoom, RoomMemberInfo } from './aoc-chat.store';

@Component({
  selector: 'bk-aoc-chat',
  standalone: true,
  imports: [
    FormsModule, 
    SvgIconPipe,
    Header, AvatarSelect,
    IonContent, IonIcon, IonList, IonItem, IonLabel, IonNote, IonBadge, IonThumbnail, IonSpinner
  ],
  providers: [AocChatStore],
  styles: [`
    :host { display: block; height: 100%; }

    .person-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--ion-color-light);
      border-bottom: 1px solid var(--ion-border-color, #dedede);
    }

    .person-bar ion-input {
      flex: 1;
      --background: var(--ion-background-color);
      --border-radius: 8px;
      --padding-start: 12px;
    }

    .three-columns {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      height: calc(100% - 56px);
      overflow: hidden;
    }

    .column {
      border-right: 1px solid var(--ion-border-color, #dedede);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .column:last-child { border-right: none; }

    .column-header {
      padding: 8px 12px;
      background: var(--ion-color-light);
      border-bottom: 1px solid var(--ion-border-color, #dedede);
      font-weight: 600;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .column-scroll {
      flex: 1;
      overflow-y: auto;
    }

    .room-item.selected { --background: var(--ion-color-primary-tint); }
    .member-item.selected { --background: var(--ion-color-primary-tint); }

    ion-thumbnail { width: 32px; height: 32px; }

    .details-grid {
      padding: 12px;
      font-size: 0.875rem;
    }

    .details-row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 4px;
      padding: 6px 0;
      border-bottom: 1px solid var(--ion-color-light);
    }

    .details-key { color: var(--ion-color-medium); }
    .details-value { word-break: break-all; }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--ion-color-medium);
      padding: 24px;
      text-align: center;
      font-size: 0.875rem;
    }

    .spinner-center {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
  `],
  template: `
      <bk-header [i18n]="{ title: title() }" />
    <ion-content>
      <div class="person-bar">
        <bk-avatar-select
          [avatar]="avatar()"
          name="roomMember"
          [selectLabel]="store.i18n.chat_select_roomMember()"
          [title]="store.i18n.chat_title()"
          [note]="store.i18n.chat_note()"
          [clearable]="true"
          [readOnly]="false"
          (selectClicked)="onPersonSelectClicked()"
          (clearClicked)="onClearPerson()"
        />
      </div>

      <!-- 3-column layout -->
      <div class="three-columns">

        <!-- Column 1: Rooms -->
        <div class="column">
          <div class="column-header">
            <span>{{ store.i18n.chat_rooms() }} ({{ rooms().length }})</span>
            @if (isLoadingRooms()) { <ion-spinner name="dots" style="width:16px;height:16px" /> }
          </div>
          <div class="column-scroll">
            @if (rooms().length === 0 && !isLoadingRooms()) {
              <div class="empty-state">{{ store.i18n.chat_no_rooms() }}</div>
            }
            <ion-list lines="inset">
              @for (room of rooms(); track room.roomId) {
                <ion-item
                  button
                  class="room-item"
                  [class.selected]="room.roomId === selectedRoomId()"
                  (click)="onRoomClick(room)"
                >
                  @if (room.joinedMembers === 1) {
                    <ion-icon slot="start" src="{{'person' | svgIcon}}" />
                  } @else {
                    <ion-icon slot="start" src="{{'people' | svgIcon}}" />
                  }
                  <ion-label>
                    <div>{{ room.name }}</div>
                    <ion-note color="medium" style="font-size:0.75rem">
                      {{ room.canonicalAlias ?? room.roomId }}
                    </ion-note>
                  </ion-label>
                  <ion-badge slot="end" color="medium">{{ room.joinedMembers }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
        </div>

        <!-- Column 2: Members -->
        <div class="column">
          <div class="column-header">
            <span>Mitglieder ({{ members().length }})</span>
            @if (isLoadingMembers()) { <ion-spinner name="dots" style="width:16px;height:16px" /> }
          </div>
          <div class="column-scroll">
            @if (!selectedRoomId()) {
              <div class="empty-state">{{ store.i18n.chat_choose_room() }}</div>
            } @else if (members().length === 0 && !isLoadingMembers()) {
              <div class="empty-state">{{ store.i18n.chat_no_members() }}</div>
            }
            <ion-list lines="inset">
              @for (member of members(); track member.userId) {
                <ion-item
                  button
                  class="member-item"
                  [class.selected]="member.userId === selectedMemberId()"
                  (click)="onMemberClick(member)"
                >
                  @if (member.avatarUrl && isPhotoUrl(member.avatarUrl)) {
                    <ion-thumbnail slot="start">
                      <img [src]="member.avatarUrl" [alt]="member.displayName" />
                    </ion-thumbnail>
                  } @else {
                    <ion-icon slot="start" src="{{'person' | svgIcon}}" />
                  }
                  <ion-label>
                    <div>{{ member.displayName || member.userId }}</div>
                    <ion-note color="medium" style="font-size:0.75rem">{{ member.membership }}</ion-note>
                  </ion-label>
                  @if (member.powerLevel > 0) {
                    <ion-badge slot="end" color="primary">{{ member.powerLevel }}</ion-badge>
                  }
                </ion-item>
              }
            </ion-list>
          </div>
        </div>

        <!-- Column 3: Details -->
        <div class="column">
          <div class="column-header">{{ store.i18n.chat_details() }}</div>
          <div class="column-scroll">
            @if (detailsTarget() === 'room' && roomDetails()) {
              <div class="details-grid">
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_id() }}</span><span class="details-value">{{ roomDetails()!.id }}</span></div>
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_name() }}</span><span class="details-value">{{ roomDetails()!.name }}</span></div>
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_created_by() }}</span><span class="details-value">{{ roomDetails()!.creator }}</span></div>
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_members() }}</span><span class="details-value">{{ roomDetails()!.numberOfJoinedMembers }}</span></div>
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_invited() }}</span><span class="details-value">{{ roomDetails()!.numberOfInvitedMembers }}</span></div>
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_public() }}</span><span class="details-value">{{ roomDetails()!.isPublic }}</span></div>
                @if (roomDetails()!.topic) {
                  <div class="details-row"><span class="details-key">{{ store.i18n.chat_topic() }}</span><span class="details-value">{{ roomDetails()!.topic }}</span></div>
                }
                @if (roomDetails()!.aliases.length > 0) {
                  <div class="details-row">
                    <span class="details-key">{{ store.i18n.chat_aliases() }}</span>
                    <span class="details-value">{{ roomDetails()!.aliases.join(', ') }}</span>
                  </div>
                }
                @if (roomDetails()!.avatarUrl) {
                  <div class="details-row">
                    <span class="details-key">{{ avatar() }}</span>
                    <span class="details-value"><img [src]="roomDetails()!.avatarUrl" style="width:48px;height:48px;object-fit:cover" /></span>
                  </div>
                }
              </div>
            } @else if (detailsTarget() === 'member' && memberDetails()) {
              <div class="details-grid">
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_uid() }}</span><span class="details-value">{{ memberDetails()!.userId }}</span></div>
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_name() }}</span><span class="details-value">{{ memberDetails()!.name }}</span></div>
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_display_name() }}</span><span class="details-value">{{ memberDetails()!.rawDisplayName }}</span></div>
                <div class="details-row"><span class="details-key">{{ store.i18n.chat_level() }}</span><span class="details-value">{{ memberDetails()!.powerLevel }}</span></div>
                @if (memberDetails()!.membership) {
                  <div class="details-row"><span class="details-key">{{ store.i18n.membership() }}</span><span class="details-value">{{ memberDetails()!.membership }}</span></div>
                }
                @if (memberDetails()!.avatarUrl) {
                  <div class="details-row">
                    <span class="details-key">{{ avatar() }}</span>
                    <span class="details-value"><img [src]="memberDetails()!.avatarUrl" style="width:48px;height:48px;object-fit:cover;border-radius:50%" /></span>
                  </div>
                }
              </div>
            } @else {
              <div class="empty-state">{{ store.i18n.chat_choose_room_or_member() }}</div>
            }
          </div>
        </div>

      </div>
    </ion-content>
  `,
})
export class AocChat {
  protected readonly store = inject(AocChatStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modelSelectService = inject(ModelSelectService);

  // bound to ion-input via ngModel
  protected personKeyInput = signal('');
  protected avatar = signal<AvatarInfo | undefined>(undefined);

  // exposed signals from store
  protected readonly rooms = computed(() => this.store.rooms());
  protected readonly members = computed(() => this.store.members());
  protected readonly roomDetails = computed(() => this.store.roomDetails());
  protected readonly memberDetails = computed(() => this.store.memberDetails());
  protected readonly isLoadingRooms = computed(() => this.store.isLoadingRooms());
  protected readonly isLoadingMembers = computed(() => this.store.isLoadingMembers());
  protected readonly selectedRoomId = computed(() => this.store.selectedRoomId());
  protected readonly selectedMemberId = computed(() => this.store.selectedMemberId());
  protected readonly selectedPersonKey = computed(() => this.store.selectedPersonKey());
  protected readonly detailsTarget = computed(() => this.store.detailsTarget());
  protected readonly title = computed(() => this.store.i18n.chat_title());

  // constants
  private imgixBaseUrl = this.store.imgixBaseUrl();
  protected isPhotoUrl = isMatrixPhotoUrl;
  protected formatTimestamp = formatMatrixTimestamp;

  // ─── person filter ──────────────────────────────────────────────────────────

  protected async onPersonSelectClicked(): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar();
    if (avatar) {
      this.store.selectPerson(avatar.key || undefined);
      this.avatar.set(avatar);
    }
  }

  protected onClearPerson(): void {
    this.personKeyInput.set('');
    this.avatar.set(undefined);
    this.store.selectPerson(undefined);
  }

  protected onReloadRooms(): void {
    this.store.reloadRooms();
  }

  // ─── room click → action sheet ──────────────────────────────────────────────

  protected async onRoomClick(room: AdminRoom): Promise<void> {
    const opts = createActionSheetOptions(this.store.i18n.as_title());
    opts.buttons.push(createActionSheetButton('chat.actionsheet.showMembers', this.store.i18n.chat_member_view(), this.imgixBaseUrl, 'people'));
    opts.buttons.push(createActionSheetButton('chat.actionsheet.showDetails', this.store.i18n.chat_details(), this.imgixBaseUrl, 'info-circle'));
    opts.buttons.push(createActionSheetButton('chat.actionsheet.rename', this.store.i18n.chat_room_rename(), this.imgixBaseUrl, 'edit'));
    opts.buttons.push(createActionSheetButton('chat.actionsheet.addAlias', this.store.i18n.chat_alias_add(), this.imgixBaseUrl, 'add-circle'));
    opts.buttons.push(createActionSheetButton('chat.actionsheet.invite', this.store.i18n.chat_room_invite(), this.imgixBaseUrl, 'person-add'));
    opts.buttons.push(createActionSheetButton('chat.actionsheet.provision', this.store.i18n.chat_user_provision(), this.imgixBaseUrl, 'key'));
    opts.buttons.push(createActionSheetButton('chat.actionsheet.delete', this.store.i18n.chat_room_delete(), this.imgixBaseUrl, 'trash'));
    opts.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

    const sheet = await this.actionSheetController.create(opts as ActionSheetOptions);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action) return;

    switch (data.action) {
      case 'chat.actionsheet.showMembers':
        this.store.showRoomMembers(room.roomId);
        break;
      case 'chat.actionsheet.showDetails':
        this.store.showRoomDetails(room.roomId);
        break;
      case 'chat.actionsheet.rename':
        await this.store.renameRoom(room.roomId);
        break;
      case 'chat.actionsheet.addAlias':
        await this.store.addAlias(room.roomId);
        break;
      case 'chat.actionsheet.invite':
        await this.store.inviteToRoom(room.roomId);
        break;
      case 'chat.actionsheet.provision':
        await this.store.provisionUser();
        break;
      case 'chat.actionsheet.delete':
        await this.store.deleteRoom(room.roomId);
        break;
    }
  }

  // ─── member click → action sheet ────────────────────────────────────────────
  protected async onMemberClick(member: RoomMemberInfo): Promise<void> {
    const roomId = this.store.selectedRoomId();
    const opts = createActionSheetOptions(this.store.i18n.as_title());

    opts.buttons.push(createActionSheetButton('chat.actionsheet.showDetails', this.store.i18n.chat_details(), this.imgixBaseUrl, 'info-circle'));
    if (roomId) {
      opts.buttons.push(createActionSheetButton('chat.actionsheet.kick', this.store.i18n.chat_member_kick(), this.imgixBaseUrl, 'exit'));
    }
    opts.buttons.push(createActionSheetButton('chat.actionsheet.deactivate', this.store.i18n.chat_user_deactivate(), this.imgixBaseUrl, 'trash'));
    opts.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

    const sheet = await this.actionSheetController.create(opts as ActionSheetOptions);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action) return;

    switch (data.action) {
      case 'chat.actionsheet.showDetails':
        this.store.showMemberDetails(member.userId);
        break;
      case 'chat.actionsheet.kick':
        if (roomId) await this.store.kickMember(member.userId, roomId);
        break;
      case 'chat.actionsheet.deactivate':
        await this.store.deactivateUser(member.userId);
        break;
    }
  }
}
