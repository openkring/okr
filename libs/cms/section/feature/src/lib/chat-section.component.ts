import { CUSTOM_ELEMENTS_SCHEMA, Component, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { StreamAutocompleteTextareaModule, StreamChatModule } from 'stream-chat-angular';
import { TranslateModule } from '@ngx-translate/core';

import { SectionModel } from '@bk2/shared/models';
import { SpinnerComponent } from '@bk2/shared/ui';
import { ChatSectionStore } from './chat-section.store';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'bk-chat-section',
  imports: [
    SpinnerComponent,
    TranslateModule,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    StreamChatModule, StreamAutocompleteTextareaModule,
  ],
  schemas: [ 
    CUSTOM_ELEMENTS_SCHEMA
  ],
    providers: [ChatSectionStore],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    stream-channel { width: 100%; }
    stream-thread { width: 45%; }
  `],
  template: `
    @if(isChatReady()) {
      @defer {
        <ion-card>
          <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <stream-channel>
                    <stream-channel-header />
                    <stream-message-list />
                    <stream-notification-list />
                    <stream-message-input />
                    <stream-thread name="thread">
                      <stream-message-list mode="thread" />
                      <stream-message-input mode="thread" />
                    </stream-thread>
                  </stream-channel>
                </ion-col>
              </ion-row>
            </ion-grid>
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

  public section = input<SectionModel>();
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected isChatReady = computed(() => this.chatSectionStore.chatUser() && this.chatSectionStore.userToken());

  constructor() {
    effect(() => {
      const _section = this.section();
      if (_section) {
        this.chatSectionStore.setConfig(_section.properties.chat);
      }
    });

    effect(async () => {
      if (isPlatformBrowser(this.platformId)) {
        const _chatUser = this.chatSectionStore.chatUser();
        const _token = this.chatSectionStore.userToken();
        if (_chatUser && _token) {
          this.chatSectionStore.initializeChat(_chatUser, _token);
        }
      }
    });
  }  
}

