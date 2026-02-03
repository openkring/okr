import { isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCol, IonGrid, IonLabel, IonRow } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { InvitationModel, InvitationsConfig, InvitationsSection, InvitationState } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { getAttendanceColor, getAttendanceIcon, hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, navigateByUrl } from '@bk2/shared-util-angular';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { InvitationSectionStore } from './invitations-section.store';

@Component({
  selector: 'bk-invitations-section',
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
  providers: [InvitationSectionStore], 
  imports: [
    SvgIconPipe, PrettyDatePipe,
    OptionalCardHeaderComponent, SpinnerComponent,
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
          <ion-grid>
            @for(inv of invitations(); track inv.bkey) {
              <ion-row (click)="showActions(inv)">
                <ion-col size="1">
                  <ion-icon size="large" src="{{getAttendanceIcon(inv.state) | svgIcon }}" color="{{getColor(inv.state)}}" />
                </ion-col>
                <ion-col size="3">
                    <ion-label>{{ inv.date | prettyDate }}</ion-label>
                </ion-col>
                <ion-col>
                  <ion-label>{{inv.name}}</ion-label>
                </ion-col>

              </ion-row>
            }
            @if(showMoreButton()) {
              <ion-row>
                <ion-col size="3">
                  <ion-button expand="block" fill="clear" (click)="openMoreUrl()">
                    Mehr...
                  </ion-button>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
      </ion-card-content>
    </ion-card>
    }
  `,
})
export class InvitationsSectionComponent implements OnInit {
  protected invitationStore = inject(InvitationSectionStore);
  private readonly platformId = inject(PLATFORM_ID);
  private actionSheetController = inject(ActionSheetController);
  private router = inject(Router);

  // inputs
  public section = input<InvitationsSection>();
  
  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly scope = computed(() => this.section()?.name);  // listId = my, all, or calevent key
  protected readonly config = computed(() => this.section()?.properties as InvitationsConfig | undefined);
  protected readonly moreUrl = computed(() => this.config()?.moreUrl ?? '');
  protected readonly showMoreButton = computed(() => this.moreUrl().length > 0);
  protected readonly maxItems = computed(() => this.config()?.maxItems ?? undefined); // undefined = show all invitations
  protected readonly showPastItems = computed(() => this.config()?.showPastItems ?? false);
  protected readonly showUpcomingItems = computed(() => this.config()?.showUpcomingItems ?? true);
  protected readonly invitations = computed(() => {
    switch (this.scope()) {
        case 'my': 
            return this.invitationStore.myInvitations();
        case 'all':
            return this.invitationStore.filteredInvitations();
        default: // explicit calevent key given
            return this.invitationStore.invitees();
        }
  });
  private currentUser = computed(() => this.invitationStore.currentUser());
  protected readOnly = computed(() => !hasRole('eventAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));
  protected isLoading = computed(() => false);

  // passing constants to the template
  private imgixBaseUrl = this.invitationStore.appStore.env.services.imgixBaseUrl;

   constructor() {
    effect(() => {
      this.invitationStore.setConfig(this.maxItems(), this.showPastItems(), this.showUpcomingItems());
      switch (this.scope()) {
        case 'my': 
            this.invitationStore.setScope('', this.currentUser()?.personKey ?? '', true);
            break;
        case 'all':
            this.invitationStore.setScope('', '', true);
            break;
        default: // explicit calevent key given
            this.invitationStore.setScope(this.scope() ?? '', '', true);
            break;
        }
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
   * Displays an ActionSheet with all possible actions on a CalEvent. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param calevent 
   */
  protected async showActions(inv: InvitationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, inv);
    await this.executeActions(actionSheetOptions, inv);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param inv 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, inv: InvitationModel): void {
    if (hasRole('registered', this.currentUser())) {
      if (inv.state !== 'accepted') {
        actionSheetOptions.buttons.push(createActionSheetButton('invitation.subscribe', this.imgixBaseUrl, 'checkbox-circle'));
      }
      if (inv.state !== 'declined') {
        actionSheetOptions.buttons.push(createActionSheetButton('invitation.unsubscribe', this.imgixBaseUrl, 'close_cancel_circle'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param invitation 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, invitation: InvitationModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'invitation.subscribe':
          await this.invitationStore.changeState(invitation, 'accepted');          
          break;
        case 'invitation.unsubscribe':
          await this.invitationStore.changeState(invitation, 'declined');
          break;
      }
    }
  }

  protected getAttendanceIcon(state: InvitationState): string {
    return getAttendanceIcon(state);
  }

  protected getColor(state: InvitationState): string {
    return getAttendanceColor(state);
  }

  protected openMoreUrl(): void {
    navigateByUrl(this.router, this.moreUrl());
  }
}
