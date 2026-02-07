import { isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCol, IonGrid, IonLabel, IonRow } from '@ionic/angular/standalone';

import { CalEventModel, EventsConfig, EventsSection } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { CalendarStore } from './calendar-section.store';
import { debugMessage, getAttendanceColor, getAttendanceIcon, getAttendanceState, hasRole } from '@bk2/shared-util-core';
import { CalEventDurationPipe } from '@bk2/calevent-util';
import { createActionSheetButton, createActionSheetOptions, navigateByUrl } from '@bk2/shared-util-angular';
import { PartPipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { Router } from '@angular/router';

@Component({
  selector: 'bk-events-section',
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
  providers: [CalendarStore], 
  imports: [
    CalEventDurationPipe, SvgIconPipe, PrettyDatePipe, PartPipe,
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
            @for(event of calevents(); track event.bkey) {
              <ion-row (click)="showActions(event)">
                <ion-col size="1">
                  @if(event.isOpen) { <!-- attendee -->
                    <ion-icon size="large" src="{{getAttendanceIcon(event.bkey) | svgIcon }}" color="{{getAttendanceColor(event.bkey)}}" />
                  } @else { <!-- invitation -->
                    <ion-icon size="large" src="{{getInvitationIcon(event.bkey) | svgIcon }}" color="{{getInvitationColor(event.bkey)}}" />
                  }
                </ion-col>
                @if(showEventTime()) {
                  <ion-col size="4">
                    <ion-label>{{ event | calEventDuration }}</ion-label>
                  </ion-col>
                } @else {
                  <ion-col size="3">
                    <ion-label>{{ event.startDate | prettyDate }}</ion-label>
                  </ion-col>
                }
                <ion-col>
                  <ion-label>{{event.name}}</ion-label>
                </ion-col>
                @if(showEventLocation() && event.locationKey !== 'unknown@unknown') {
                  <ion-col class="ion-hide-md-down" size="3">
                    <ion-label>{{ event.locationKey | part:true }}</ion-label>
                  </ion-col>
                }

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
export class EventsSectionComponent implements OnInit {
  protected calendarStore = inject(CalendarStore);
  private readonly platformId = inject(PLATFORM_ID);
  private actionSheetController = inject(ActionSheetController);
  private router = inject(Router);

  // inputs
  public section = input<EventsSection>();
  public editMode = input<boolean>(false);

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly calendarName = computed(() => this.section()?.name);
  protected readonly config = computed(() => this.section()?.properties as EventsConfig | undefined);
  protected readonly moreUrl = computed(() => this.config()?.moreUrl ?? '');
  protected readonly showMoreButton = computed(() => this.moreUrl().length > 0);
  protected readonly maxEvents = computed(() => this.config()?.maxEvents ?? undefined); // undefined = show all calevents
  protected readonly showPastEvents = computed(() => this.config()?.showPastEvents ?? false);
  protected readonly showUpcomingEvents = computed(() => this.config()?.showUpcomingEvents ?? true);
  protected readonly showEventTime = computed(() => this.config()?.showEventTime ?? false);
  protected readonly showEventLocation = computed(() => this.config()?.showEventLocation ?? false);
  protected readonly calevents = computed(() => this.calendarStore.calevents());
  private currentUser = computed(() => this.calendarStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('eventAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));

  protected isLoading = computed(() => false);
  //protected filteredEvents = computed(() => this.eventsStore.filteredEvents());

  // passing constants to the template
  private imgixBaseUrl = this.calendarStore.appStore.env.services.imgixBaseUrl;

   constructor() {
    effect(() => {
      this.calendarStore.setConfig(this.calendarName(), this.maxEvents(), this.showPastEvents(), this.showUpcomingEvents());
      debugMessage(`EventsSection(): calendarName=${this.calendarName()}`, this.currentUser());
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
  protected async showActions(calevent: CalEventModel): Promise<void> {
    if (this.editMode()) return;
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, calevent);
    await this.executeActions(actionSheetOptions, calevent);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param calevent 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, calevent: CalEventModel): void {
    if (hasRole('registered', this.currentUser())) {
      if (calevent.isOpen) {
        const state = getAttendanceState(calevent, this.currentUser()?.personKey ?? '');
        if (state !== 'accepted') {
          actionSheetOptions.buttons.push(createActionSheetButton('calevent.subscribe', this.imgixBaseUrl, 'checkbox-circle'));
        }
        if (state !== 'declined') {
          actionSheetOptions.buttons.push(createActionSheetButton('calevent.unsubscribe', this.imgixBaseUrl, 'close_cancel_circle'));
        }
      } else {  // invitation
        // get invitation for current user
        const inv = this.calendarStore.invitations().find(inv => inv.caleventKey === calevent.bkey);
        if (inv) {
          if (inv.state !== 'accepted') {
            actionSheetOptions.buttons.push(createActionSheetButton('calevent.subscribe', this.imgixBaseUrl, 'checkbox-circle'));
          }
          if (inv.state !== 'declined') {
            actionSheetOptions.buttons.push(createActionSheetButton('calevent.unsubscribe', this.imgixBaseUrl, 'close_cancel_circle'));
          }
        }
      }
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param calEvent 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, calEvent: CalEventModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'calevent.subscribe':
          await this.calendarStore.subscribe(calEvent);
          break;
        case 'calevent.unsubscribe':
          await this.calendarStore.unsubscribe(calEvent);
          break;
      }
    }
  }

  protected getAttendanceIcon(caleventKey: string): string {
    const state = this.calendarStore.states()[caleventKey];
    return getAttendanceIcon(state);
  }

  protected getAttendanceColor(caleventKey: string): string {
    const state = this.calendarStore.states()[caleventKey];
    return getAttendanceColor(state);
  }

  protected getInvitationIcon(caleventKey: string): string {
    const state = this.calendarStore.invitationStates()[caleventKey];
    return state ? getAttendanceIcon(state) : '';
  }

  protected getInvitationColor(caleventKey: string): string {
    const state = this.calendarStore.invitationStates()[caleventKey];
    return state ? getAttendanceColor(state) : '';
  }

  protected openMoreUrl(): void {
    if (this.editMode()) return;
    navigateByUrl(this.router, this.moreUrl());
  }
}
