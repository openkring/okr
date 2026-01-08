import { isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, IonCard, IonCardContent } from '@ionic/angular/standalone';
import { AttachmentService, StreamAutocompleteTextareaModule, StreamChatModule } from 'stream-chat-angular';

import { ChatSection } from '@bk2/shared-models';
import { SpinnerComponent } from '@bk2/shared-ui';

import { ChatSectionStore } from './chat-section.store';

@Component({
  selector: 'bk-chat-section',
  standalone: true,
  imports: [
    SpinnerComponent,
    IonCard, IonCardContent,
    StreamChatModule, StreamAutocompleteTextareaModule,
  ],
  schemas: [ 
    CUSTOM_ELEMENTS_SCHEMA
  ],
    providers: [ChatSectionStore],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    stream-channel { width: 70%; }
    stream-thread { width: 45%; }
    #chat-container { display: flex; height: 100%; }
    stream-message-input ::ng-deep .str-chat__message-input__attach-button,
    stream-message-input ::ng-deep button[aria-label="Attach files"] {
      display: none !important;
    }
    stream-channel-list { width: 30%; }
    .custom-plus {
      background: none;
      border: none;
      font-size: 28px;
      color: var(--ion-color-primary);
      cursor: pointer;
    }
  `],
  template: `
    @if(isChatReady()) {
      @defer {
        <ion-card>
          <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
          <ion-card-content class="ion-no-padding">
            <ion-grid class="full-height">
              <ion-row class="full-height">
                @if(showChannelList()) {
                  <ion-col size="12" size-md="4">
                    <stream-channel-list />
                  </ion-col>
                }
                <ion-col size="12" size-md="8">
                  <stream-channel>
                    <stream-channel-header />
                    <stream-message-list />
                    <ion-item>
                      <ion-icon slot="start" name="add-outline" size="large" (click)="presentAttachmentActions()" class="custom-plus"></ion-icon>
                      <stream-message-input 
                        [isFileUploadEnabled]="true"
                        [areMentionsEnabled]="true"
                        [areEmojisEnabled]="false"
                        [displayVoiceRecordingButton]="false"
                        [autoFocus]="true"
                      />
                    </ion-item>
                    <stream-thread name="thread">
                      <stream-message-list mode="thread" />
                      <stream-message-input mode="thread" />
                    </stream-thread>
                  </stream-channel>
                </ion-col>
              </ion-row>
            </ion-grid>
<!--             <div id="chat-container">
              @if(showChannelList()) {
                <stream-channel-list />
              }
              <stream-channel>
                <stream-channel-header />
                <stream-message-list />
                <stream-notification-list />

                <stream-message-input
                  [isFileUploadEnabled]="true"
                  [areMentionsEnabled]="false"
                  [areEmojisEnabled]="false"
                  [displayVoiceRecordingButton]="false"
                >
                  <ion-button slot="start" (click)="presentAttachmentActions()">
                    <ion-icon name="add-outline" size="large"></ion-icon>
                  </ion-button>
                </stream-message-input>
                <stream-thread name="thread">
                  <stream-message-list mode="thread" />
                  <stream-message-input mode="thread" />
                </stream-thread>
              </stream-channel>
            </div> -->
          </ion-card-content>
        </ion-card>
      } @placeholder {
        <bk-spinner />
      }
    } @else {
      <bk-spinner />
    }
  `
})
export class ChatSectionComponent {
  private readonly chatSectionStore = inject(ChatSectionStore);
  private readonly platformId = inject(PLATFORM_ID);
  private attachmentService = inject(AttachmentService);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public section = input<ChatSection>();

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected isChatReady = computed(() => this.chatSectionStore.chatUser() && this.chatSectionStore.userToken());
  protected showChannelList = computed(() => this.section()?.properties.showChannelList ?? true);

  constructor() {
    effect(() => {
      const section = this.section();
      if (section) {
        this.chatSectionStore.setConfig(section.properties);
      }
    });

    effect(async () => {
      if (isPlatformBrowser(this.platformId)) {
        const chatUser = this.chatSectionStore.chatUser();
        const token = this.chatSectionStore.userToken();
        if (chatUser && token && !this.chatSectionStore.isChatInitialized()) {
          this.chatSectionStore.initializeChat(chatUser, token);
        }
      }
    });
  }
  
  async presentAttachmentActions(): Promise<void> {
    const actionSheet = await this.actionSheetController.create({
      header: 'Add attachment',
      buttons: [
        {
          text: 'Select file',
          icon: 'document-outline',
          handler: () => {
            const fileInput = document.querySelector('stream-message-input input[type="file"]') as HTMLElement;
            fileInput?.click();
          },
        },
        {
          text: 'Send current location',
          icon: 'location-outline',
          handler: () => this.sendCurrentLocation()
        },
        {
          text: 'Emoji',
          icon: 'happy-outline',
          handler: () => {
            const emojiToggle = document.querySelector('stream-message-input button.str-chat__emoji-picker-toggle') as HTMLElement;
            emojiToggle?.click();
          }
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  private async sendCurrentLocation(): Promise<void> {
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        await this.chatSectionStore.sendLocationMessage(
          this.section()?.properties.id ?? 'chat',
          `Aktueller Standort: ${latitude},${longitude}`,
          latitude,
          longitude
        );
      },
      err => console.error('Location error:', err),
      { enableHighAccuracy: true }
    );
  }
}
