import { Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonBadge, IonCard, IonCardContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { EmptyListComponent, MoreButton, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { debugMessage } from '@bk2/shared-util-core';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { MatrixRoom, MessagesConfig, MessagesSection } from '@bk2/shared-models';

import { MessagesStore } from './messages-section.store';


@Component({
  selector: 'bk-messages-section',
  standalone: true,
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
    ion-label { font-size: 1em; }
  `],
  providers: [MessagesStore],
  imports: [
    OptionalCardHeaderComponent, SpinnerComponent, EmptyListComponent, MoreButton,
    IonCard, IonCardContent, IonList, IonItem, IonLabel, IonBadge,
  ],
  template: `
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if(rooms().length === 0) {
            <bk-empty-list message="@cms.messages.empty" />
          } @else {
            <ion-list lines="inset">
              @for(room of rooms(); track room.roomId) {
                <ion-item (click)="openRoom(room)" button detail="false">
                  <ion-label>{{ room.name }}</ion-label>
                  @if(room.unreadCount > 0) {
                    <ion-badge slot="end" color="danger">{{ room.unreadCount }}</ion-badge>
                  }
                </ion-item>
              }
            </ion-list>
            @if(showMoreButton() && !editMode()) {
              <bk-more-button [url]="moreUrl()" />
            }
          }
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class MessagesSectionComponent {
  protected readonly messagesStore = inject(MessagesStore);
  private readonly router = inject(Router);

  // inputs
  public section = input<MessagesSection>();
  public editMode = input<boolean>(false);

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly config = computed(() => this.section()?.properties as MessagesConfig | undefined);
  protected readonly moreUrl = computed(() => this.config()?.moreUrl ?? '');
  protected readonly showMoreButton = computed(() => this.moreUrl().length > 0);
  protected readonly maxItems = computed(() => this.config()?.maxItems ?? undefined);
  protected readonly rooms = computed(() => this.messagesStore.rooms());
  protected readonly isLoading = computed(() => this.messagesStore.isLoading());

  constructor() {
    effect(() => {
      this.messagesStore.setConfig(this.maxItems());
      debugMessage(`MessagesSection(): maxItems=${this.maxItems()}`, this.messagesStore.currentUser());
    });
  }

  protected openRoom(room: MatrixRoom): void {
    if (this.editMode()) return;
    navigateByUrl(this.router, '/private/chat/c-contentpage', { selectedRoom: room.roomId });
  }
}
