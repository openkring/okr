import { isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCol, IonGrid, IonLabel, IonRow } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { EmptyListComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { debugMessage, hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, navigateByUrl } from '@bk2/shared-util-angular';
import { MessagesConfig, MessagesSection, SectionModel } from '@bk2/shared-models';

import { MessagesStore } from './messages-section.store';


@Component({
  selector: 'bk-messages-section',
  standalone: true,
  styles: [
    `
      ion-card-content {
        padding: 0px;
      }
      ion-card {
        padding: 0px;
        margin: 0px;
        border: 0px;
        box-shadow: none !important;
      }
      ion-label { font-size: 1em; }
      ion-icon { font-size: 28px; width: 28px; height: 28px; }
    `,
  ],
  providers: [MessagesStore], 
  imports: [
    OptionalCardHeaderComponent, SpinnerComponent, EmptyListComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonLabel
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if(isLoading()) {
    <bk-spinner />
    } @else {        
        <ion-card>
            <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
            <ion-card-content>
                @if(numberOfMessages() === 0) {
                    <bk-empty-list message="@cms.messages.empty" />
                } @else {
                    <ion-list lines="inset">
                        @for(message of messages(); track $index) {
                            <ion-item (click)="showActions(message)">                            
                                <ion-label class="name">{{ message.name }}</ion-label>
                            </ion-item>
                        } 
                        @if(showMoreButton()) {
                            <ion-grid>
                                <ion-row>
                                    <ion-col size="3">
                                        <ion-button expand="block" fill="clear" (click)="openMoreUrl()">
                                            Mehr...
                                        </ion-button>
                                    </ion-col>
                                </ion-row>
                            </ion-grid>
                        }
                    </ion-list>
                }
            </ion-card-content>
        </ion-card>
    }
  `,
})
export class MessagesSectionComponent implements OnInit {
  protected messagesStore = inject(MessagesStore);
  private readonly platformId = inject(PLATFORM_ID);
  private router = inject(Router);
  private actionSheetController = inject(ActionSheetController);
  
  // inputs
  public section = input<MessagesSection>();
  public editMode = input<boolean>(false);

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly config = computed(() => this.section()?.properties as MessagesConfig | undefined);
  protected readonly moreUrl = computed(() => this.config()?.moreUrl ?? '');
  protected readonly showMoreButton = computed(() => this.moreUrl().length > 0);
  protected readonly maxItems = computed(() => this.config()?.maxItems ?? undefined); // undefined = show all messages
  protected readonly messages = computed(() => this.messagesStore.messages());
  protected readonly numberOfMessages = computed(() => this.messages().length);
  protected currentUser = computed(() => this.messagesStore.currentUser());
  protected isLoading = computed(() => false);

  private imgixBaseUrl = this.messagesStore.appStore.env.services.imgixBaseUrl;

   constructor() {
    effect(() => {
      this.messagesStore.setConfig(this.maxItems());
      debugMessage(`MessagesSection(): maxItems=${this.maxItems()}`, this.currentUser());
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // angular component calls render() from ngAfterViewInit() which is too early for fullcalendar in Ionic (should be in ionViewDidLoad())
      // the calendar renders correctly if render() is called after the page is loaded, e.g. by resizing the window.
      // that's what this hack is doing: trigger resize window after 1ms
      setTimeout( () => {
        if (isPlatformBrowser(this.platformId)) {
          window.dispatchEvent(new Event('resize'));
        }
      }, 1);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Message. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param message 
   */
  protected async showActions(message: SectionModel): Promise<void> {
    if (this.editMode()) return;
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, message);
    await this.executeActions(actionSheetOptions, message);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param message 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, message: SectionModel): void {
    if (hasRole('registered', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('message.view', this.imgixBaseUrl, 'eye-on'));
    }
    if (hasRole('eventAdmin', this.currentUser()) || hasRole('privileged', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('message.edit', this.imgixBaseUrl, 'create_edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param message 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, message: SectionModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'message.view':
            await this.messagesStore.edit(message, true);
            break;
        case 'message.edit':
            await this.messagesStore.edit(message, false);
            break;
      }
    }
  }

  protected openMoreUrl(): void {
    if (this.editMode()) return;
    navigateByUrl(this.router, this.moreUrl());
  }
}
