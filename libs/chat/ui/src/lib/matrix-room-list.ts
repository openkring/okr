import { Component, computed, input, output, signal } from '@angular/core';

import { IonList, IonItem, IonItemDivider, IonLabel, IonBadge, IonNote, IonIcon, IonThumbnail, IonButton } from '@ionic/angular';

import { MatrixRoom } from '@okr/shared-models';
import { MultiAvatarPipe, SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';

import { formatMatrixTimestamp, isMatrixPhotoUrl, isOwnNotesRoom, MatrixChatI18n, NotesRoomOwner, splitFavouriteRooms } from '@okr/chat-util';

@Component({
  selector: 'okr-matrix-room-list',
  standalone: true,
  imports: [
    MultiAvatarPipe,
    SvgIconPipe,
    IonList,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonBadge,
    IonNote,
    IonIcon,
    IonThumbnail,
    IonButton,
],
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
    }

    .room-item {
      cursor: pointer;
      --padding-start: 8px;
      --padding-end: 8px;
    }

    .room-item.selected {
      --background: var(--ion-color-light);
    }

    .room-item.unread {
      font-weight: 600;
    }

    ion-thumbnail {
      width: 30px;
      height: 30px;
    }

    .unread-badge {
      min-width: 20px;
      height: 20px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
    }

    /* Section header above the pinned block and above the rest. Deliberately quiet: the
       block itself carries the meaning, so there is no pin icon on the individual rows. */
    ion-item-divider.section {
      --background: transparent;
      --padding-start: 12px;
      --padding-end: 12px;
      min-height: 30px;
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ion-color-medium);
    }

    ion-item-divider.section ion-icon {
      font-size: 0.8125rem;
      margin-inline-end: 6px;
    }

    .muted-icon {
      font-size: 0.875rem;
      margin-inline-start: 6px;
      color: var(--ion-color-medium);
      flex-shrink: 0;
    }

    ion-item-divider.hidden-toggle {
      cursor: pointer;
    }

    .room-item.hidden-room {
      opacity: 0.7;
    }

    .typing-indicator {
      font-size: 0.75rem;
      color: var(--ion-color-primary);
      font-style: italic;
    }
  `],
  template: `
    <ion-list>
      @for (section of sections(); track section.key) {
        @if (section.label) {
          <ion-item-divider class="section">
            @if (section.icon) {
              <ion-icon src="{{ section.icon | svgIcon }}" />
            }
            <ion-label>{{ section.label }}</ion-label>
          </ion-item-divider>
        }
        @if (section.key === 'pinned' && showNotesPlaceholder()) {
          <ion-item button class="room-item" (click)="notesPlaceholderSelected.emit()">
            <ion-icon slot="start" src="{{ notesIcon | svgIcon }}" />
            <ion-label>{{ i18n().notes_room_name() }}</ion-label>
          </ion-item>
        }
        @for (room of section.rooms; track room.roomId) {
          <ion-item
            button
            [class.selected]="room.roomId === selectedRoomId()"
            [class.unread]="room.unreadCount > 0"
            class="room-item"
            (click)="roomSelected.emit(room.roomId)"
          >
            @if (isNotes(room)) {
              <ion-icon slot="start" src="{{ notesIcon | svgIcon }}" />
            } @else if (room.avatar && isPhotoUrl(room.avatar)) {
              <ion-thumbnail slot="start">
                <img [src]="room.avatar" [alt]="room.name" />
              </ion-thumbnail>
            } @else {
              <ion-icon slot="start" src="{{room | multiAvatar | svgIcon}}" />
            }
            <ion-label>
              <div style="display: flex; align-items: center;">
                <span>{{ isNotes(room) ? i18n().notes_room_name() : room.name }}</span>
                @if (mutedRoomIds().has(room.roomId)) {
                  <ion-icon class="muted-icon" src="{{ muteIcon | svgIcon }}" [attr.aria-label]="i18n().mute_on()" />
                }
              </div>
              <ion-note color="medium">{{ formatTimestamp(room.lastMessage?.timestamp || 0) }}</ion-note>
            </ion-label>
            @if (room.unreadCount > 0) {
              <!-- A muted room keeps its count, dimmed: it does not count towards the badges (1.109 §9). -->
              <ion-badge slot="end" [color]="mutedRoomIds().has(room.roomId) ? 'medium' : 'primary'" class="unread-badge">
                {{ room.unreadCount > 99 ? '99+' : room.unreadCount }}
              </ion-badge>
            }
          </ion-item>
        }
      }

      @if (visibleRooms().length === 0) {
        <ion-item>
          <ion-label class="ion-text-center">
            <p>{{ i18n().room_none() }}</p>
          </ion-label>
        </ion-item>
      }

      <!-- «Ausgeblendet (n)» (spec 1.109 §10.1): collapsed by default, each row can come back. -->
      @if (hiddenRooms().length > 0) {
        <ion-item-divider class="section hidden-toggle" role="button" tabindex="0" [attr.aria-expanded]="hiddenOpen()"
          (click)="toggleHidden()" (keydown.enter)="toggleHidden()" (keydown.space)="toggleHidden(); $event.preventDefault()">
          <ion-icon src="{{ (hiddenOpen() ? 'chevron-down' : 'chevron-forward') | svgIcon }}" />
          <ion-label>{{ hiddenLabel() }}</ion-label>
        </ion-item-divider>
        @if (hiddenOpen()) {
          @for (room of hiddenRooms(); track room.roomId) {
            <ion-item class="room-item hidden-room">
              <ion-icon slot="start" src="{{ room | multiAvatar | svgIcon }}" />
              <ion-label>{{ isNotes(room) ? i18n().notes_room_name() : room.name }}</ion-label>
              <ion-button slot="end" fill="clear" size="small" (click)="roomUnhidden.emit(room.roomId)">
                {{ i18n().details_unhide() }}
              </ion-button>
            </ion-item>
          }
        }
      }
    </ion-list>
  `
})
export class MatrixRoomList {
  // inputs
  public readonly i18n = input.required<MatrixChatI18n>();
  rooms = input.required<MatrixRoom[]>();
  selectedRoomId = input<string>();

  /** Who the notes room must belong to; undefined until the user is known. */
  notesOwner = input<NotesRoomOwner>();
  /** Show the «Notizen an mich» placeholder row (room not created yet, not a kiosk user). */
  showNotesPlaceholder = input(false);

  /** Rooms that show the 🔕 (muted, never support / Notfall) — decided by the store. */
  public readonly mutedRoomIds = input<ReadonlySet<string>>(new Set<string>());
  /** Rooms the user hid; listed under «Ausgeblendet (n)». */
  public readonly hiddenRooms = input<MatrixRoom[]>([]);

  roomSelected = output<string>();
  /** «Wieder einblenden» on a hidden room. */
  public readonly roomUnhidden = output<string>();
  notesPlaceholderSelected = output<void>();

  /** Icon of the notes room row. */
  protected readonly notesIcon = 'text';
  /** Icon of a muted row — the same as the Stumm tile (`notifications-off` is not in the icon set). */
  protected readonly muteIcon = 'alarm';

  /** Whether the «Ausgeblendet» block is open (collapsed by default). */
  protected readonly hiddenOpen = signal(false);
  protected readonly hiddenLabel = computed(() => fill(this.i18n().hidden_section(), { n: this.hiddenRooms().length }));

  protected toggleHidden(): void {
    this.hiddenOpen.update((open) => !open);
  }

  protected readonly isNotes = (room: MatrixRoom): boolean => isOwnNotesRoom(room, this.notesOwner());

  isPhotoUrl = isMatrixPhotoUrl;

  /**
   * The rooms actually worth showing. `!!`-prefixed and "Empty room" entries are Matrix
   * bookkeeping rooms, never a chat a member opened.
   */
  protected readonly visibleRooms = computed(() => this.rooms().filter(
    room => !room.name.startsWith('!!') && !room.name.startsWith('Empty room')
  ));

  /**
   * One section per block. Rooms the user pinned (`m.favourite`) come first under their own
   * heading; without a single pinned room there is only one unlabelled section, so the list
   * looks exactly as it did before the pinning feature.
   */
  protected readonly sections = computed(() => {
    const { favourites, others } = splitFavouriteRooms(this.visibleRooms(), this.isNotes);
    if (favourites.length === 0 && !this.showNotesPlaceholder()) return [{ key: 'all', label: '', icon: '', rooms: others }];
    return [
      { key: 'pinned', label: this.i18n().room_pinned_section(), icon: 'star', rooms: favourites },
      { key: 'all', label: this.i18n().room_all_section(), icon: '', rooms: others },
    ];
  });

  protected formatTimestamp(timestamp: number): string {
    return formatMatrixTimestamp(timestamp, this.i18n().date_yesterday());
  }
}
