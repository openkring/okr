import { AsyncPipe } from '@angular/common';
import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, inject, input, linkedSignal, OnInit, PLATFORM_ID, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CalEventModel, RoleName } from '@bk2/shared-models';
import { PartPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { DateFormat, addTime, debugData, getIsoDateTime, getYear, getYearList, hasRole, parseEventString, warn } from '@bk2/shared-util-core';
import { format } from 'date-fns';

import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { AvatarDisplayComponent } from '@bk2/avatar-ui';

import { CalEventDurationPipe } from '@bk2/calevent-util';
import { CalEventStore } from './calevent.store';
import { Browser } from '@capacitor/browser';

@Component({
    selector: 'bk-calevent-list',
    standalone: true,
    imports: [
      TranslatePipe, AsyncPipe, CalEventDurationPipe, SvgIconPipe, PartPipe,
      FullCalendarModule,
      SpinnerComponent, EmptyListComponent, AvatarDisplayComponent,
      MenuComponent, ListFilterComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonTextarea,
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    styles: [`
      ion-card-content { padding: 0px;}
      ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
      ion-textarea { margin-top: 10px;}
      full-calendar { width: 100%; height: 800px;}

      :host ::ng-deep .fc-toolbar-title {
        font-size: 0.9rem !important;
        font-weight: 500;
      }
      :host ::ng-deep .fc-button-primary {
        background-color: #5b9bd5 !important;
        border-color: #5b9bd5 !important;
        color: #fff !important;
      }
      :host ::ng-deep .fc-button-primary:hover {
        background-color: #3a82c4 !important;
        border-color: #3a82c4 !important;
      }
      :host ::ng-deep .fc-button-primary:not(:disabled).fc-button-active {
        background-color: #1c65a8 !important;
        border-color: #1c65a8 !important;
      }

      @media (max-width: 600px) {
        :host ::ng-deep .fc-toolbar-title {
          display: none !important;
        }
      }
    `,
  ],
    providers: [CalEventStore],
    template: `
    <ion-header>
      @if(contextMenuName() !== 'disable') {
        <ion-toolbar [color]="color()">
          @if(showMainMenu() === true) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ filteredCalEventsCount()}}/{{calEventsCount()}} {{ '@calevent.plural' | translate | async }}</ion-title>
          @if(canChange()) {
            <ion-buttons slot="end">
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                <ng-template>
                  <ion-content>
                    <bk-menu [menuName]="contextMenuName()"/>
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>
          }
        </ion-toolbar>
      }

      <!-- quick entry -->
      @if(canChange() && expertMode()) {
        <ion-item lines="none">
          <ion-textarea #bkQuickEntry 
            (keyup.enter)="quickEntry(bkQuickEntry)"
            label = "{{'@input.eventQuickEntry.label' | translate | async }}"
            labelPlacement = "floating"
            placeholder = "{{'@input.eventQuickEntry.placeholder' | translate | async }}"
            [counter]="true"
            fill="outline"
            [maxlength]="1000"
            [rows]="1"
            inputmode="text"
            type="text"
            [autoGrow]="true">
          </ion-textarea>
          <ion-icon slot="end" src="{{'cancel' | svgIcon }}" (click)="clear(bkQuickEntry)" />
        </ion-item>
      }

      <!-- search and filters -->
      <bk-list-filter
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        (typeChanged)="onTypeSelected($event)" [types]="types()"
        (yearChanged)="onYearSelected($event)" [years]="years()"
        [initialView]="view()" (viewToggleChanged)="onViewChange($event)" gridIcon="calendar"
      />

      <!-- list header -->
    @if(isListView()) {
      <ion-toolbar>
        <ion-grid>
          <ion-row>
            <ion-col size="6" size-md="3">
              <ion-label><strong>{{ '@calevent.list.header.duration' | translate | async }}</strong></ion-label>
            </ion-col>
            <ion-col size="6" size-md="4">
              <ion-label><strong>{{ '@calevent.list.header.name' | translate | async }}</strong></ion-label>
            </ion-col>
            <ion-col size="3" class="ion-hide-md-down">
              <ion-label><strong>{{ '@calevent.list.header.location' | translate | async }}</strong></ion-label>
            </ion-col>
            <ion-col size="2" class="ion-hide-md-down">
              <ion-label><strong>{{ '@calevent.list.header.responsible' | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    }

  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if(filteredCalEventsCount() === 0) {
        <bk-empty-list message="@calevent.field.empty" />
      } @else {
        @if(isListView() === false) {
          <ion-card>
            <ion-card-content>
              <div [style.display]="'block'">
                {{ calEventsCount() }} {{'@calevent.plural' | translate | async}}

                <full-calendar #fullCalendar
                  [options]="calendarOptions" 
                  [events]="calendarEvents()" 
                />
              </div>
            </ion-card-content>
          </ion-card>
        } @else {
          <ion-list lines="inset">
            @for(event of filteredCalEvents(); track event.bkey) {
              <ion-item (click)="showActions(event)">
                <ion-label>{{ event | calEventDuration }}</ion-label>
                <ion-label>{{event.name}}</ion-label>
                <ion-label class="ion-hide-md-down">{{ event.locationKey | part:true }}</ion-label>
                <ion-label class="ion-hide-md-down"><bk-avatar-display [avatars]="event.responsiblePersons" /></ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    }
  </ion-content>
    `
})
export class CalEventListComponent implements OnInit {
  protected readonly store = inject(CalEventStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly fullCalendar = viewChild<FullCalendarComponent>('fullCalendar');

  // inputs
  public listId = input.required<string>();     // calendar name or all or my
  public contextMenuName = input.required<string>(); // the name of the context menu to use or 'disable' to disable the header toolbar with the context menu
  public color = input('secondary');
  public view = input<'list' | 'grid'>('grid'); // initial view mode
  public showMainMenu = input<boolean>(true);
  
  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedCategory());

  // data
  protected calEventsCount = computed(() => this.store.calEventsCount());
  protected filteredCalEvents = computed(() => this.store.filteredCalEvents() ?? []);
  protected filteredCalEventsCount = computed(() => this.filteredCalEvents().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected popupId = computed(() => `c_calevent_${this.listId}`);
  protected types = computed(() => this.store.appStore.getCategory('calevent_type'));
  private currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly years = computed(() => getYearList(getYear() + 1, 30));
  protected isListView = linkedSignal(() => this.view() === 'list');
  protected expertMode = computed(() => this.hasRole('admin'));

  protected calendarEvents = computed<EventInput[]>(() => {
    return this.filteredCalEvents().map(event => {
      const isFullDay = event.fullDay === true;
      if (isFullDay) {
        const toIsoDate = (d: string) => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
        const startIso = toIsoDate(event.startDate);
        const endDate = event.endDate || event.startDate;
        // FullCalendar end is exclusive — add 1 calendar day using local-time constructor (timezone-safe)
        const ed = new Date(+endDate.slice(0,4), +endDate.slice(4,6) - 1, +endDate.slice(6,8) + 1);
        const endIso = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,'0')}-${String(ed.getDate()).padStart(2,'0')}`;
        return {
          title: event.name,
          start: startIso,
          end: endIso,
          allDay: true,
          extendedProps: { eventKey: event.bkey },
          backgroundColor: '#3788d8',
          borderColor: '#3788d8'
        };
      }
      return {
        title: event.name,
        start: getIsoDateTime(event.startDate, event.startTime),
        end: getIsoDateTime(event.endDate || event.startDate, addTime(event.startTime, 0, event.durationMinutes)),
        extendedProps: { eventKey: event.bkey },
        backgroundColor: '#3788d8',
        borderColor: '#3788d8'
      };
    });
  });

  protected calendarOptions = {
    plugins: [dayGridPlugin, interactionPlugin, timeGridPlugin],
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    locale: 'de',
    buttonText: {
      today: 'Heute',
      month: 'Monat',
      week: 'Woche',
      day: 'Tag',
    },
    views: {
      timeGridWeek: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        titleFormat: (args: any) => {
          const p = (n: number) => String(n).padStart(2, '0');
          const s = args.start, e = args.end ?? args.start;
          return `${p(s.day)}.${p(s.month + 1)}–${p(e.day)}.${p(e.month + 1)}`;
        },
      },
      timeGridDay: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        titleFormat: (args: any) => {
          const p = (n: number) => String(n).padStart(2, '0');
          const s = args.start;
          return `${p(s.day)}.${p(s.month + 1)}.${s.year}`;
        },
      },
    },
    firstDay: 1,
    height: 'auto',
    slotMinTime: '05:00:00',
    slotMaxTime: '22:00:00',
    weekNumbers: true,
    editable: true,
    dateClick: (arg: any) => { this.onDateClick(arg); },
    eventClick: (arg: any) => { this.onEventClick(arg); },
    eventDrop: (arg: any) => { this.onEventDrop(arg); },
    eventResize: (arg: any) => { this.onEventResize(arg); },
  };

  // double-click tracking
  private lastClickDateStr: string | null = null;
  private lastClickTime = 0;

  // passing constants to the template
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    effect(() => this.store.setCalendarName(this.listId()));

    // When the filtered results change and we're in calendar view, navigate to
    // the week of the first result so the user sees it immediately.
    effect(() => {
      const first = this.filteredCalEvents()[0];
      if (!first || this.isListView()) return;
      const d = first.startDate; // stored as 'YYYYMMDD'
      if (!d || d.length < 8) return;
      const date = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
      this.fullCalendar()?.getApi()?.gotoDate(date);
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    }
  }

  ionViewDidEnter(): void {
    if (!this.isListView()) {
      setTimeout(() => this.fullCalendar()?.getApi()?.updateSize(), 50);
    }
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedCategory(type);
  }

  protected onYearSelected(year: number): void {
    this.store.setSelectedYear(year);
  }

  /******************************* actions *************************************** */
  /**
   * This is the quick entry. It just takes the name of the event together with a date and optional time and adds it to the list.
   * @param eventName 
   */
  protected async quickEntry(bkQuickEntry: IonTextarea): Promise<void> {
    const calevent = new CalEventModel(this.store.tenantId());
    const calname = this.store.calendarName();
    if (!calname || calname === '') {
      error(undefined, 'CalEventListComponent.quickEntry: missing calendar name');
      return;
    }
    calevent.calendars = [calname];
    const parts = parseEventString(bkQuickEntry.value?.trim() ?? '');
    if (!parts.startDate || parts.startDate === '') {
      error(undefined, 'CalEventListComponent.quickEntry: startDate is mandatory in quick entry');
      return;
    }
    calevent.startDate = parts.startDate;
    if (parts.startTime && parts.startTime.length === 4) {
      calevent.startTime = parts.startTime.substring(0, 2) + ':' + parts.startTime.substring(2, 4);
      calevent.endDate = calevent.startDate;
    } else {  // daily event, once, one day
      calevent.endDate = calevent.startDate;
      calevent.startTime = '';
      calevent.fullDay = true;
      calevent.durationMinutes = 1440;  // full day event
    }
    calevent.name = parts.name || '';
    calevent.locationKey = parts.location || '';
    calevent.type = parts.type || '';
    await this.store.quickEntry(calevent);
    bkQuickEntry.value = '';
  }

  protected clear(bkQuickEntry: IonTextarea): void {
    bkQuickEntry.value = '';
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(this.canChange(), undefined, undefined, !this.isListView()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      case 'exportIcs': 
        const cal =  this.store.calendar();
        console.log('exportIcs: ', cal);
        if (!cal) {
          error(undefined, 'all or my calendars can not be exported');
        } else {
          const url = 'https://europe-west6-bkaiser-org.cloudfunctions.net/generateCalendarICS?calendar=' + cal.bkey;
          Browser.open({ url: url, windowName: '_blank' });
        }
        break;
      default: error(undefined, `CalEventListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a CalEvent. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param calEvent 
   */
  protected async showActions(calEvent: CalEventModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, calEvent);
    await this.executeActions(actionSheetOptions, calEvent);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param calEvent 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, calEvent: CalEventModel): void {
    if (this.canChange(calEvent)) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.edit', this.imgixBaseUrl, 'edit'));
      if (!calEvent.isOpen && this.store.isGroupCalevent(calEvent)) {
        actionSheetOptions.buttons.push(createActionSheetButton('calevent.inviteGroup', this.imgixBaseUrl, 'add'));
      }
      if (!calEvent.isOpen) {
        actionSheetOptions.buttons.push(createActionSheetButton('calevent.invitePerson', this.imgixBaseUrl, 'person-add'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.delete', this.imgixBaseUrl, 'trash'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.view', this.imgixBaseUrl, 'eye-on'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * Permissions:
   * - eventAdmin, responsibles, if group-calendar: admin/mainContact: add, edit, delete
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
        case 'calevent.delete':
          await this.store.delete(calEvent, this.canChange(calEvent));
          break;
        case 'calevent.edit': {
          const isGrid = !this.isListView();
          const targetDate = calEvent.startDate;
          await this.store.edit(calEvent, false, !this.canChange(calEvent), false, isGrid);
          if (isGrid) this.navigateCalendarTo(targetDate);
          break;
        }
        case 'calevent.view':
          await this.store.edit(calEvent, false, true);
          break;
        case 'calevent.inviteGroup':
          await this.store.inviteGroupMembers(calEvent, this.canChange(calEvent));
          break;
        case 'calevent.invitePerson':
          await this.store.invitePerson(calEvent, this.canChange(calEvent));
          break;
      }
    }
  }

  protected onViewChange(showList: boolean): void {
    this.isListView.set(showList);
    if (showList === false) {
      // Need to update calendar size after it becomes visible
      setTimeout(() => {
        const calendarApi = this.fullCalendar()?.getApi();
        if (calendarApi) {
          calendarApi.updateSize();
        }
      }, 0);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onDateClick(arg: any): Promise<void> {
    const now = Date.now();
    const dateStr = arg.dateStr as string;
    const calApi = this.fullCalendar()?.getApi();
    const currentView = calApi?.view.type;

    if (this.lastClickDateStr === dateStr && now - this.lastClickTime < 300) {
      this.lastClickDateStr = null;
      if (currentView === 'dayGridMonth') {
        calApi?.changeView('timeGridWeek', arg.date);
      } else if (currentView === 'timeGridWeek') {
        calApi?.changeView('timeGridDay', arg.date);
      }
      return;
    }

    this.lastClickDateStr = dateStr;
    this.lastClickTime = now;

    if (this.canChange()) {
      const startDate = format(arg.date as Date, DateFormat.StoreDate);
      const startTime = format(arg.date as Date, 'HH:mm');
      await this.store.add(false, startDate, startTime, true);
      this.navigateCalendarTo(startDate);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onEventDrop(arg: any): Promise<void> {
    if (!this.canChange()) { arg.revert(); return; }
    const eventKey = arg.event.extendedProps?.eventKey as string;
    if (!eventKey) { arg.revert(); return; }
    const calevent = this.filteredCalEvents().find(e => e.bkey === eventKey);
    if (!calevent) { arg.revert(); return; }
    const start = arg.event.start as Date;
    const updated: CalEventModel = { ...calevent, startDate: format(start, DateFormat.StoreDate), startTime: format(start, 'HH:mm') };
    const saved = await this.store.update(updated, false);
    if (!saved) arg.revert();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onEventResize(arg: any): Promise<void> {
    const eventKey = arg.event.extendedProps?.eventKey as string;
    if (!eventKey) { arg.revert(); return; }
    const calevent = this.filteredCalEvents().find(e => e.bkey === eventKey);
    if (!calevent || !this.canChange(calevent)) { arg.revert(); return; }
    const start = arg.event.start as Date;
    const end = arg.event.end as Date;
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const updated: CalEventModel = { ...calevent, startDate: format(start, DateFormat.StoreDate), startTime: format(start, 'HH:mm'), endDate: format(end, DateFormat.StoreDate), durationMinutes };
    const saved = await this.store.update(updated, false);
    if (!saved) arg.revert();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async onEventClick(arg: any) {
    const eventKey = arg.event.extendedProps.eventKey as string;
    debugData<string>('CaleventList.onEventClick: event selected: ', eventKey, this.currentUser());
    const calevents = this.filteredCalEvents();
    const calevent = calevents.find(e => e.bkey === eventKey);
    if (calevent) {
      await this.showActions(calevent);
    } else {
      warn('CalEventListComponent.onEventClick: calEvent ' + eventKey + ' not found');
    }
  }

  /******************************* helpers *************************************** */

  /** Navigate the FullCalendar to the week containing the given storeDate (YYYYMMDD).
   *  Uses a 300ms delay to let the post-save reload complete before navigating. */
  private navigateCalendarTo(storeDate: string): void {
    if (!storeDate || storeDate.length < 8) return;
    const iso = `${storeDate.slice(0,4)}-${storeDate.slice(4,6)}-${storeDate.slice(6,8)}`;
    setTimeout(() => this.fullCalendar()?.getApi()?.gotoDate(iso), 300);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  /**
   * CalendarEvents may be created, changed or deleted by the following users:
   * - user has role eventAdmin or privileged
   * - user is responsiblePerson of the calevent
   * - if calevent is part of a group calendar: user is admin or mainContact of that group
   * @param calevent 
   * @returns 
   */
  protected canChange(calevent?: CalEventModel): boolean {
    // 1) general roles
    if (this.hasRole('eventAdmin')) return true;
    if (this.hasRole('privileged')) return true;

    const personKey = this.currentUser()?.personKey;
    if (!personKey) return false;

    // 2) group calendar: check if currentUser is admin or mainContact of the owning group
    if (calevent) {
      const allCalendars = this.store.calendarsResource.value() ?? [];
      for (const calKey of calevent.calendars) {
        const cal = allCalendars.find(c => c.bkey === calKey);
        if (cal?.owner?.startsWith('group.')) {
          const groupKey = cal.owner.substring(6);
          const group = this.store.appStore.getGroup(groupKey);
          if (group?.admin?.key === personKey || group?.mainContact?.key === personKey) return true;
        }
      }
    }

    // 3) responsible person on the calevent
    if (calevent?.responsiblePersons?.some(p => p.key === personKey)) return true;

    return false;
  }
}
