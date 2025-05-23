import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { ChannelService, ChatClientService, StreamAutocompleteTextareaModule, StreamChatModule, StreamI18nService } from 'stream-chat-angular';
import { User } from 'stream-chat';

import { ModelType, SectionModel } from '@bk2/shared/models';
import { TranslateModule } from '@ngx-translate/core';
import { SpinnerComponent } from '@bk2/shared/ui';
import { AppStore } from '@bk2/auth/feature';
import { getAvatarImgixUrl } from '@bk2/shared/pipes';

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
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    stream-channel { width: 100%; }
    stream-thread { width: 45%; }
  `],
  template: `
    @if(section(); as section) {
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
    } @else {
      <bk-spinner />
    }
  `
})
export class ChatSectionComponent implements OnInit {
  private readonly appStore = inject(AppStore);
  private readonly chatService = inject(ChatClientService);
  private readonly channelService = inject(ChannelService);
  private readonly streamI18nService = inject(StreamI18nService);

  public section = input<SectionModel>();
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly currentUser = computed(() => this.appStore.currentUser());
  protected readonly userId = computed(() => this.currentUser()?.bkey);
  protected readonly userName = computed(() => this.currentUser()?.firstName);
  protected readonly userAvatar = computed(() => 
    getAvatarImgixUrl(this.appStore.firestore, ModelType.Person + '.' + this.currentUser()?.personKey, this.appStore.env.thumbnail.width, this.appStore.env.app.imgixBaseUrl)
  );
  protected readonly streamUser = computed(() => {
    return {
      id: this.userId() ?? '',
      name: this.userName(),
      image: this.userAvatar()
    } as User;
  });
  
  constructor() {
    const apiKey = this.appStore.env.chat.apiKey;

    /**
     * The user token should be calculated on the server based on appid (= tenantId), apiKey and appSecret.
     * see: https://gyfchong.medium.com/authenticating-your-app-users-with-getstream-io-c78693e0ac9b
     * For testing purposes, we use a hardcoded token.
     * This can be generated per user here (given the userId and the appSecret): 
     * https://getstream.io/chat/docs/react/token_generator?_gl=1*aesoge*_up*MQ..*_ga*MTgwMDMxNjMzMi4xNzQ3OTk4MzUw*_ga_FX552ZCLHK*czE3NDc5OTgzNDkkbzEkZzAkdDE3NDc5OTgzNDkkajAkbDAkaDEzNTg3NzUyNDQkZDVJUG10dHUxWHJGYUpxRmpJOGFySklsbjRxeDNsVy1xRXc.
     */
    const userToken = this.appStore.env.chat.userToken;     // temporary solution for testing purposes
    this.chatService.init(apiKey, this.streamUser(), userToken);
    this.streamI18nService.setTranslation();
  }
  
  // tbd: put the channel config into the configuration
  // tbd: support for multiple channels
  // tbd: support for multiple users
  // tbd: support for audio/video calls
  async ngOnInit() {
    const _id = 'trainings';
    this.initializeChannel(_id, 'Trainings', 'https://seeclub.imgix.net/scs/section/n656NBYZ1HJmnhhIGrpZ/documents/Screenshot%202024-06-25%20at%2023.58.47.png');
    this.channelService.init({
      type: 'messaging',
      id: { $eq: _id },
    });

  }

  private async initializeChannel(id: string, name: string, image: string) {
    const channel = this.chatService.chatClient.channel('messaging', id, {
      // add as many custom fields as you'd like
      image: image,
      name: name
    });
    await channel.create();
  }
}

