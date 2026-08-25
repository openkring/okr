import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, inject, Injector, input, linkedSignal, OnInit, PLATFORM_ID, signal, untracked, viewChild } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, AlertController, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTextarea, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { Browser } from '@capacitor/browser';
import { Router } from '@angular/router';
import { format } from 'date-fns';

import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { DEFAULT_DATE } from '@okr/shared-constants';
import { AvatarInfo, CalEventModel, LocationModel, PersonModel, RoleName } from '@okr/shared-models';
import { ModelSelectService } from '@okr/shared-feature';
import { PartPipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AppNavigationService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error, isBrowser, keepDefaultTrue, navigateByUrl, okrPrompt, QuickEntryService } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, addTime, debugData, getAttendanceColor, getAttendanceIcon, getAttendanceState, getAvatarInfo, getIsoDateTime, fill, getYear, getYearList, hasRole, parseEventString, warn } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { AvatarDisplay } from '@okr/avatar-ui';
import { isAdminMember } from '@okr/subject-group-util';

import { CalEventDurationPipe, canAttendCalevent, countPollAcceptances, countPollResponses, formatDateTimeLabel, getCalEventCssClass, isPastCalevent, isPersonalCalendarName, isPersonalCalevent, mayJoinOpenCalevent, upcomingOccurrences } from '@okr/calevent-util';
import { showCalendarSync } from '@okr/calevent-ui';
import type { OrganiserContactAction, OrganiserContactResult } from '@okr/calevent-ui';
import { browseUrl } from '@okr/subject-address-util';
import { MatrixChatService } from '@okr/chat-data-access';
import { CalEventStore } from './calevent.store';

const ICS_FUNCTION_URL = 'https://europe-west6-bkaiser-org.cloudfunctions.net/generateCalendarICS';

type AttendanceState = 'accepted' | 'declined' | 'invited';
type AttendanceFilter = AttendanceState | 'all';

@Component({
    selector: 'okr-calevent-list',
    standalone: true,
    imports: [
      CalEventDurationPipe, SvgIconPipe, PartPipe,
      FullCalendarModule, Spinner, EmptyList, AvatarDisplay, Menu, ListFilter,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonTextarea,
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    styles: [`
      ion-card-content { padding: 0px;}
      ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
      ion-textarea {
        margin-top: 10px;
        --background: var(--ion-color-light-tint, #f4f5f8);
        --border-color: var(--ion-color-medium);
        --border-width: 2px;
        --border-radius: 8px;
        --padding-start: 12px;
        --padding-end: 12px;
      }
      /* no fixed height: the calendar uses height:'auto' and must size to its content,
         otherwise the last hours of the time grid get clipped on narrow screens. */
      full-calendar { width: 100%; }

      :host ::ng-deep .fc-toolbar-title {
        font-size: 0.9rem !important;
        font-weight: 500;
      }
      :host ::ng-deep .fc-button-primary {
        background-color: var(--ion-color-primary) !important;
        border-color: var(--ion-color-primary) !important;
        color: var(--ion-color-primary-contrast) !important;
      }
      :host ::ng-deep .fc-button-primary:hover {
        background-color: var(--ion-color-primary-shade) !important;
        border-color: var(--ion-color-primary-shade) !important;
      }
      :host ::ng-deep .fc-button-primary:not(:disabled).fc-button-active {
        /* one step darker than :hover — Ionic has no var below -shade */
        background-color: color-mix(in srgb, var(--ion-color-primary-shade) 85%, black) !important;
        border-color: color-mix(in srgb, var(--ion-color-primary-shade) 85%, black) !important;
      }

      @media (max-width: 600px) {
        :host ::ng-deep .fc-toolbar-title {
          display: none !important;
        }
      }

      /* State colours. FullCalendar builds its event DOM outside Angular, so these need ::ng-deep
         and explicit colours — the --fc-* vars alone lose against FullCalendar's own rules. */
      :host ::ng-deep .fc-event.state-proposed,
      :host ::ng-deep .fc-event.state-proposed .fc-event-main {
        background-color: #5b3fa8 !important;
        border-color: #7d5fd0 !important;
        color: #e6dcff !important;
      }
      :host ::ng-deep .fc-event.state-provisional,
      :host ::ng-deep .fc-event.state-provisional .fc-event-main {
        background-color: #8a6a10 !important;
        border-color: #c89a30 !important;
        color: #fff3d6 !important;
      }
      :host ::ng-deep .fc-event.state-cancelled,
      :host ::ng-deep .fc-event.state-cancelled .fc-event-main {
        background-color: #a02020 !important;
        border-color: #d94545 !important;
        color: #ffe3e3 !important;
        text-decoration: line-through;
      }

      /* month view renders timed events as a dot + text instead of a filled block */
      :host ::ng-deep .fc-daygrid-dot-event.state-proposed { color: #7d5fd0 !important; background: none !important; }
      :host ::ng-deep .fc-daygrid-dot-event.state-provisional { color: #c89a30 !important; background: none !important; }
      :host ::ng-deep .fc-daygrid-dot-event.state-cancelled { color: #d94545 !important; background: none !important; }
      :host ::ng-deep .fc-daygrid-dot-event.state-proposed .fc-daygrid-event-dot { border-color: #7d5fd0 !important; }
      :host ::ng-deep .fc-daygrid-dot-event.state-provisional .fc-daygrid-event-dot { border-color: #c89a30 !important; }
      :host ::ng-deep .fc-daygrid-dot-event.state-cancelled .fc-daygrid-event-dot { border-color: #d94545 !important; }

      /* Badge on proposed FullCalendar events */
      :host ::ng-deep .fc-event .accept-badge {
        display: inline-block;
        background: rgba(255, 255, 255, 0.25);
        border-radius: 4px;
        padding: 0 4px;
        font-size: 0.75em;
        margin-left: 4px;
        vertical-align: middle;
      }

      /* List view: left border + text colour per state */
      ion-item.state-proposed { border-left: 3px solid #7d5fd0; }
      ion-item.state-provisional { border-left: 3px solid #c89a30; }
      ion-item.state-cancelled {
        border-left: 3px solid #a02020;
        --color: var(--ion-color-danger);
        text-decoration: line-through;
      }
    `,
  ],
    providers: [CalEventStore],
    template: `
    @if(showMenu()) {
      <ion-header>
        @if(contextMenuName() !== 'disable') {
          <ion-toolbar [color]="color()">
            @if(showMenuButton() === true) {
              <!-- ion-hide-lg-up: the split-pane already shows the side menu on desktop (>=lg);
                   autoHide=false so the button is not auto-removed on mobile, where users need it -->
              <ion-buttons slot="start" class="ion-hide-lg-up"><ion-menu-button [autoHide]="false" /></ion-buttons>
            }
            <ion-title>{{ filteredCalEventsCount()}}/{{calEventsCount()}} {{ store.i18n.calevents() }}</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="store.showInfo()" [title]="store.i18n.info_open()">
                <ion-icon slot="icon-only" src="{{'info-circle' | svgIcon }}" />
              </ion-button>
              @if(showViewToggle()) {
                <ion-button (click)="toggleView()">
                  <ion-icon slot="icon-only" src="{{ (isListView() ? 'calendar' : 'list') | svgIcon }}" />
                </ion-button>
              }
              <!-- no canChange() gate here: okr-menu already role-gates every entry (registered users
                   get 'Filter'/'Termin erfassen', privileged ones the export/schedule actions). Gating the
                   trigger as well hid the whole menu from registered users on shared calendars. -->
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                <ng-template>
                  <ion-content>
                    <okr-menu [menuName]="contextMenuName()" [forceVisible]="groupAdmin()" [forceVisibleSelf]="isPersonalCalendar()" [excludeNames]="excludedMenuNames()" [toggleStates]="{ toggleFilter: showFilter() }"/>
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>
          </ion-toolbar>
        }

        <!-- quick entry -->
        @if(canChange() && expertMode()) {
          <ion-item lines="none">
            <ion-textarea #okrQuickEntry
              (keyup.enter)="quickEntry(okrQuickEntry)"
              (ionInput)="onQuickEntryInput(okrQuickEntry)"
              [label] = "store.i18n.quick_entry_label()"
              labelPlacement = "floating"
              [placeholder] = "store.i18n.quick_entry_placeholder()"
              [counter]="true"
              fill="outline"
              [maxlength]="1000"
              [rows]="1"
              inputmode="text"
              type="text"
              [autoGrow]="true">
            </ion-textarea>
            @if(quickEntryText().length > 0) {
              <ion-icon slot="end" src="{{'cancel' | svgIcon }}" (click)="clear(okrQuickEntry)" />
            }
          </ion-item>
        }

        <!-- search and filters — hidden on small screens by default; toggled via the context-menu 'toggleFilter' action -->
        @if(showFilter()) {
          <okr-list-filter
            (searchTermChanged)="onSearchtermChange($event)"
            (tagChanged)="onTagSelected($event)" [tags]="tags()"
            (typeChanged)="onTypeSelected($event)" [types]="types()"
            (yearChanged)="onYearSelected($event)" [years]="years()" [selectedYear]="store.selectedYear()"
          />
        }

        <!-- list header -->
      @if(isListView()) {
        <ion-toolbar>
          <!-- attendance filter: cycles all -> accepted -> declined -> open -->
          <ion-buttons slot="start">
            <ion-button (click)="cycleAttendanceFilter()">
              @if(attendanceFilter() === 'all') {
                <ion-label>{{ store.i18n.filter_all() }}</ion-label>
              } @else {
                <ion-icon slot="icon-only" src="{{ getAttendanceIcon(attendanceFilter()) | svgIcon }}" color="{{ getAttendanceColor(attendanceFilter()) }}" />
              }
            </ion-button>
          </ion-buttons>
          <ion-grid>
            <ion-row>
              <ion-col size="6" size-md="3">
                <ion-label><strong>{{ store.i18n.list_header_duration() }}</strong></ion-label>
              </ion-col>
              <ion-col size="6" size-md="4">
                <ion-label><strong>{{ store.i18n.topic() }}</strong></ion-label>
              </ion-col>
              <ion-col size="3" class="ion-hide-md-down">
                <ion-label><strong>{{ store.i18n.location() }}</strong></ion-label>
              </ion-col>
              <ion-col size="2" class="ion-hide-md-down">
                <ion-label><strong>{{ store.i18n.list_header_responsible() }}</strong></ion-label>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-toolbar>
      }

    </ion-header>
  }

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <okr-spinner />
    } @else {
      @if(filteredCalEventsCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        @if(isListView() === false) {
          <ion-card>
            <ion-card-content>
              <div [style.display]="'block'">
                <full-calendar #fullCalendar
                  [options]="calendarOptions()"
                  [events]="calendarEvents()" 
                />
              </div>
            </ion-card-content>
          </ion-card>
        } @else {
          <ion-list lines="inset">
            @for(event of filteredCalEvents(); track event.okey; let i = $index) {
              <ion-item [id]="'calevent-' + i" (click)="showActions(event)" [class]="getCalEventCssClass(event.state)">
                <!-- always an icon in slot=start, otherwise rows without an attendance state
                     lose their leading column and the whole list misaligns. 'remove' (grey) means
                     An-/Abmeldung is not possible on this event. -->
                @if(attendanceState(event); as state) {
                  <ion-icon slot="start" src="{{ getAttendanceIcon(state) | svgIcon }}" color="{{ getAttendanceColor(state) }}" />
                } @else {
                  <ion-icon slot="start" src="{{ 'remove' | svgIcon }}" color="medium" [title]="store.i18n.attendance_not_possible()" />
                }
                <ion-label>{{ event | calEventDuration }}</ion-label>
                <ion-label>{{event.name}}</ion-label>
                <ion-label class="ion-hide-md-down">{{ event.locationKey | part:true }}</ion-label>
                @if(showMenu()) {
                <ion-label class="ion-hide-md-down"><okr-avatar-display [avatars]="event.responsiblePersons" /></ion-label>
                }
              </ion-item>
            }
          </ion-list>
        }
      }
    }
  </ion-content>
    `
})
export class CalEventList implements OnInit {
  protected readonly store = inject(CalEventStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);
  private readonly modalController = inject(ModalController);
  private readonly quickEntryService = inject(QuickEntryService);
  private readonly modelSelectService = inject(ModelSelectService);
  private selectedQuickEntryPerson = signal<PersonModel | null>(null);
  private selectedQuickEntryLocation = signal<LocationModel | null>(null);
  protected quickEntryText = signal('');
  private isSettingQuickEntryValue = false;
  private readonly matrixChatService = inject(MatrixChatService);
  private readonly router = inject(Router);
  private readonly appNavigationService = inject(AppNavigationService);
  private readonly injector = inject(Injector);
  private readonly fullCalendar = viewChild<FullCalendarComponent>('fullCalendar');

  protected readonly getCalEventCssClass = getCalEventCssClass;

  // inputs
  public listId = input.required<string>();     // calendar name or all or my
  public contextMenuName = input.required<string>(); // the name of the context menu to use or 'disable' to disable the header toolbar with the context menu
  public color = input('secondary');
  public view = input<'list' | 'grid'>('grid'); // initial view mode
  // initial year filter; 99 = all years. Query params arrive as strings, hence the Number() transform
  // (unbound route inputs arrive as undefined -> NaN -> falls back to the current year).
  public year = input(getYear(), { transform: (value: unknown) => Number(value) || getYear() });
  public showMenu = input<boolean>(true);   // for /public/calendar
  // withComponentInputBinding() sets unbound route inputs to undefined, overriding the input(true)
  // default — keepDefaultTrue restores the intended default while an explicit [x]="false" still wins.
  public showMenuButton = input(true, { transform: keepDefaultTrue }); // false in group view
  public showViewToggle = input(true, { transform: keepDefaultTrue }); // false when the view toggle is hoisted to a parent toolbar (group view)
  public groupAdmin = input(false);
  /**
   * Deep link from the group chat: `/calevent/<cal>/c-calevents?poll=<seriesId>` opens the poll.
   * Typed as possibly-undefined on purpose — withComponentInputBinding writes `undefined` into an
   * unbound route input and would clobber a plain `input('')` default.
   */
  public readonly poll = input<string | undefined>(undefined);
  /**
   * Deep link of a shared short link: `/calevent/all/c-calevents?event=<okey>` opens the event.
   * Same undefined-default reasoning as `poll` above.
   */
  public readonly event = input<string | undefined>(undefined);

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedCategory());

  // attendance filter: 'all' shows everything, the other values match the attendance state of the current user
  protected attendanceFilter = signal<AttendanceFilter>('all');

  // data
  protected calEventsCount = computed(() => this.store.calEventsCount());
  protected filteredCalEvents = computed(() => {
    const events = this.store.filteredCalEvents() ?? [];
    const filter = this.attendanceFilter();
    if (filter === 'all') return events;
    return events.filter(event => this.attendanceState(event) === filter);
  });
  protected filteredCalEventsCount = computed(() => this.filteredCalEvents().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected popupId = computed(() => `c_calevent_${this.listId}`);
  protected types = computed(() => this.store.appStore.tryGetCategory('calevent_type'));
  private currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly years = computed(() => getYearList(getYear() + 1, 30));
  public isListView = linkedSignal(() => this.view() === 'list');
  protected expertMode = computed(() => this.hasRole('admin'));
  /** The personal calendars ('personal', 'my'): every registered user may create and manage their own events here. */
  protected isPersonalCalendar = computed(() => isPersonalCalendarName(this.store.calendarName()));

  /**
   * Die Kalender, die der Benutzer abonnieren darf: die aus seinen Mitgliedschaften plus die
   * offenen des Tenants. Spiegelt die Zugangsprüfung in `calendarFeed` — beide Seiten müssen
   * dieselbe Menge ergeben.
   */
  protected readonly subscribableCalendars = computed(() => {
    const mine = this.store.calendarsOfCurrentUser();
    return (this.store.calendarsResource.value() ?? [])
      .filter(c => mine.includes(c.okey) || c.defaultIsOpen === true)
      .map(c => ({ key: c.okey, title: c.title || c.name }));
  });
  /** Schedule polls only exist in group calendars — hide the entry everywhere else (e.g. /calevent/all). */
  protected excludedMenuNames = computed(() => this.store.isGroupCalendar() ? [] : ['calevent-schedule']);
  private readonly firstFutureIndex = computed(() => {
    const today = format(new Date(), 'yyyyMMdd');
    return this.filteredCalEvents().findIndex(e => e.startDate >= today);
  });

  protected calendarEvents = computed<EventInput[]>(() => {
    return this.filteredCalEvents().map(event => {
      const cssClass = getCalEventCssClass(event.state);
      const isProposed = event.state === 'proposed';
      // a poll stores its answers in the event's own attendees, so both counts read from there
      const acceptanceCount = isProposed ? countPollAcceptances(event) : 0;
      const invitedCount = isProposed ? countPollResponses(event) : 0;

      const commonProps: Partial<EventInput> = {
        title: event.name,
        classNames: cssClass ? [cssClass] : [],
        extendedProps: {
          eventKey: event.okey,
          state: event.state,
          acceptanceCount,
          invitedCount,
        },
      };

      const isFullDay = event.fullDay === true;
      if (isFullDay) {
        const toIsoDate = (d: string) => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
        const startIso = toIsoDate(event.startDate);
        const endDate = event.endDate || event.startDate;
        // FullCalendar end is exclusive — add 1 calendar day using local-time constructor (timezone-safe)
        const ed = new Date(+endDate.slice(0,4), +endDate.slice(4,6) - 1, +endDate.slice(6,8) + 1);
        const endIso = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,'0')}-${String(ed.getDate()).padStart(2,'0')}`;
        return {
          ...commonProps,
          start: startIso,
          end: endIso,
          allDay: true,
        } as EventInput;
      }
      return {
        ...commonProps,
        start: getIsoDateTime(event.startDate, event.startTime),
        end: getIsoDateTime(event.endDate || event.startDate, addTime(event.startTime, 0, event.durationMinutes)),
      } as EventInput;
    });
  });

  // computed: the i18n signals start out empty, so buttonText must re-evaluate once they resolve
  protected calendarOptions = computed(() => ({
    plugins: [dayGridPlugin, interactionPlugin, timeGridPlugin],
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    locale: 'de',
    buttonText: {
      today: this.store.i18n.cal_today(),
      month: this.store.i18n.cal_month(),
      week:  this.store.i18n.cal_week(),
      day:   this.store.i18n.cal_day(),
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
    eventContent: (arg: any) => {
      if (arg.event.extendedProps?.['state'] === 'proposed') {
        const acc = arg.event.extendedProps?.['acceptanceCount'] ?? 0;
        const tot = arg.event.extendedProps?.['invitedCount'] ?? 0;
        const title = arg.event.title;
        const escapedTitle = title
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return { html: `<div class="fc-event-title-container"><div class="fc-event-title">${escapedTitle} <span class="accept-badge">${acc}/${tot}</span></div></div>` };
      }
      return true;
    },
  }));

  // the year the calendar was last navigated for; -1 = never
  private navigatedYear = -1;

  // whether the `poll` deep link has already opened its modal this session
  private pollOpened = false;
  private eventOpened = false;

  // double-click tracking
  private lastClickDateStr: string | null = null;
  private lastClickTime = 0;

  // passing constants to the template
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  private readonly platformId = inject(PLATFORM_ID);

  // filter row: shown by default from Ionic's sm breakpoint (576px), hidden on smaller screens.
  // Toggled via the context-menu 'toggleFilter' action.
  protected readonly showFilter = signal(isBrowser(this.platformId) && window.innerWidth >= 576);

  constructor() {
    effect(() => this.store.setCalendarName(this.listId()));
    effect(() => this.store.setSelectedYear(this.year()));

    // List view: scroll to the first event that is today or in the future.
    effect(() => {
      const idx = this.firstFutureIndex();
      if (!this.isListView() || this.isLoading() || idx < 0) return;
      if (!isBrowser(this.platformId)) return;
      setTimeout(() => {
        document.getElementById(`calevent-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    });

    // Calendar view: start at today for the current year; jump to first event when a past/future year is selected.
    // Only reacts to an actual year change — otherwise every reload (save, subscribe, invitation answer) would
    // throw the user back to today instead of leaving the calendar on the week/day they were looking at.
    effect(() => {
      const year = this.store.selectedYear();
      const events = this.filteredCalEvents();
      if (this.isListView() || this.isLoading()) return;
      if (year === this.navigatedYear) return;
      this.navigatedYear = year;
      const currentYear = new Date().getFullYear();
      if (year === currentYear || year === 99) {   // 99 = all years -> today, not the oldest event
        this.fullCalendar()?.getApi()?.today();
      } else {
        const first = events[0];
        if (!first) return;
        const d = first.startDate;
        if (!d || d.length < 8) return;
        const date = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
        this.fullCalendar()?.getApi()?.gotoDate(date);
      }
    });

    // Deep link from the group chat: open the poll once, then strip the param so a back-navigation
    // does not reopen it.
    effect(() => {
      const seriesId = this.poll();
      if (!seriesId || this.pollOpened) return;
      this.pollOpened = true;
      untracked(() => this.openSchedulePoll(seriesId).then(() =>
        this.router.navigate([], { queryParams: { poll: null }, queryParamsHandling: 'merge', replaceUrl: true })));
    });

    // Deep link of a shared short link: open the event once, then strip the param. The store
    // reads the event by key rather than picking it out of the loaded list — the recipient's
    // filters and time window are not the sender's.
    effect(() => {
      const okey = this.event();
      if (!okey || this.eventOpened) return;
      this.eventOpened = true;
      untracked(() => this.store.viewByKey(okey).then(() =>
        this.router.navigate([], { queryParams: { event: null }, queryParamsHandling: 'merge', replaceUrl: true })));
    });
  }

  ngOnInit(): void {
    if (isBrowser(this.platformId)) {
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
  protected async quickEntry(okrQuickEntry: IonTextarea): Promise<void> {
    const calevent = new CalEventModel(this.store.tenantId());
    const calname = this.store.calendarName();
    if (!calname || calname === '') {
      error(undefined, 'CalEventList.quickEntry: missing calendar name');
      return;
    }
    calevent.calendars = [calname];
    const parts = parseEventString(okrQuickEntry.value?.trim() ?? '');
    if (!parts.startDate || parts.startDate === '') {
      error(undefined, 'CalEventList.quickEntry: startDate is mandatory in quick entry');
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
    const pickedLocation = this.selectedQuickEntryLocation();
    if (pickedLocation) {
      calevent.locationKey = `${pickedLocation.okey}@${pickedLocation.name}`; // [locationKey]@[label] convention (PartPipe / LocationLabelPipe)
      this.selectedQuickEntryLocation.set(null);
    } else {
      calevent.locationKey = parts.location || '';
    }
    const person = this.selectedQuickEntryPerson();
    if (person) {
      const avatarInfo = getAvatarInfo(person, 'person');
      if (avatarInfo) {
        calevent.responsiblePersons = [avatarInfo];
      }
      this.selectedQuickEntryPerson.set(null);
    }
    await this.store.quickEntry(calevent);
    okrQuickEntry.value = '';
    this.quickEntryText.set('');
    if (!this.isListView()) this.navigateCalendarTo(calevent.startDate);
  }

  protected clear(okrQuickEntry: IonTextarea): void {
    okrQuickEntry.value = '';
    this.quickEntryText.set('');
    this.selectedQuickEntryPerson.set(null);
    this.selectedQuickEntryLocation.set(null);
  }

  protected async onQuickEntryInput(textarea: IonTextarea): Promise<void> {
    this.quickEntryText.set(textarea.value ?? '');
    if (this.isSettingQuickEntryValue) return;
    const value = textarea.value ?? '';
    const trigger = this.quickEntryService.detectTrigger(value);
    if (!trigger) return;
    this.isSettingQuickEntryValue = true;
    try {
      if (trigger === 'person') {
        const person = await this.modelSelectService.selectPerson();
        if (person) {
          this.selectedQuickEntryPerson.set(person);
          textarea.value = this.quickEntryService.replaceToken(value, '@', `@${person.firstName} ${person.lastName}`);
        } else {
          textarea.value = value.slice(0, -1); // remove stray '@'
        }
      } else if (trigger === 'date') {
        const { DateTimeSelectModal: DateTimeSelectModal } = await import('@okr/shared-ui');
        const modal = await this.modalController.create({
          component: DateTimeSelectModal,
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<string>();
        if (role === 'confirm' && data) {
          const datePart = data.substring(0, 10); // 'yyyy-MM-dd'
          const viewDate = convertDateFormatToString(datePart, DateFormat.IsoDate, DateFormat.ViewDate);
          const timePart = data.length >= 16 ? data.substring(11, 16) : '00:00'; // 'HH:mm'
          const token = timePart === '00:00'
            ? viewDate
            : `${viewDate},${timePart.replace(':', '')}`;
          textarea.value = this.quickEntryService.replaceToken(value, '//', token);
        } else {
          textarea.value = value.slice(0, -2); // remove stray '//'
        }
      } else if (trigger === 'location') {
        const result = await this.modelSelectService.selectLocation('', true, false);
        if (result?.kind === 'predefined') {
          this.selectedQuickEntryLocation.set(result.location);
          textarea.value = this.quickEntryService.replaceToken(value, '!!', '');
        } else {
          textarea.value = value.slice(0, -2); // remove stray '!!'
        }
      }
    } finally {
      this.isSettingQuickEntryValue = false;
    }
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'add': {
        const isGrid = !this.isListView();
        const viewType = this.currentViewType();
        const created = await this.store.add(!this.canChange(), undefined, undefined, isGrid);
        if (isGrid && created) this.navigateCalendarTo(created.startDate, viewType);
        break;
      }
      case 'exportRaw': await this.store.export("raw"); break;
      case 'exportIcs': 
        const cal =  this.store.calendar();
        console.log('exportIcs: ', cal);
        if (!cal) {
          error(undefined, 'all or my calendars can not be exported');
        } else {
          const url = 'https://europe-west6-bkaiser-org.cloudfunctions.net/generateCalendarICS?calendar=' + cal.okey;
          Browser.open({ url: url, windowName: '_blank' });
        }
        break;
      case 'sync': {
        await showCalendarSync(this.modalController, {
          calendars: this.subscribableCalendars(),
          selected: this.store.calendar()?.okey ?? 'my',
        });
        break;
      }
      case 'schedule':
        if (this.store.schedule()) await this.openSchedulePoll('');   // schedule() = the group-calendar guard
        break;
      case 'toggleFilter': this.showFilter.update(v => !v); break;
      default: error(undefined, `CalEventList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a CalEvent. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param calEvent 
   */
  protected async showActions(calEvent: CalEventModel): Promise<void> {
    if (!this.showMenu()) return;
    const label = formatDateTimeLabel(calEvent.startDate, calEvent.startTime, calEvent.durationMinutes);
    const actionSheetOptions = createActionSheetOptions(`${label} · ${calEvent.name}`);
    this.addActionSheetButtons(actionSheetOptions, calEvent);
    await this.executeActions(actionSheetOptions, calEvent);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param calEvent 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, calevent: CalEventModel): void {
    // attendance actions (subscribe/unsubscribe) make no sense for past events
    const showAttendance = !isPastCalevent(calevent);
    const canChange = this.canChange(calevent);
    if (calevent.isOpen) {
      const state = getAttendanceState(calevent, this.currentUser()?.personKey ?? '');
      if (showAttendance && state !== 'accepted') {
        actionSheetOptions.buttons.push(createActionSheetButton('calevent.subscribe', this.store.i18n.invitation_subscribe(), this.imgixBaseUrl, 'checkbox-circle'));
      }
      if (showAttendance && state !== 'declined') {
        actionSheetOptions.buttons.push(createActionSheetButton('calevent.unsubscribe', this.store.i18n.invitation_unsubscribe(), this.imgixBaseUrl, 'cancel'));
      }
    } else {  // invitation
      // get invitation for current user
      const inv = this.store.invitations().find(inv => inv.caleventKey === calevent.okey);
      // the organiser of a personal event has no invitation but may still accept/decline (attendees list)
      const ownState = inv ?? { state: getAttendanceState(calevent, this.currentUser()?.personKey ?? '') };
      if ((inv || isPersonalCalevent(calevent)) && showAttendance) {
        if (ownState.state !== 'accepted') {
          actionSheetOptions.buttons.push(createActionSheetButton('calevent.subscribe', this.store.i18n.invitation_subscribe(), this.imgixBaseUrl, 'checkbox-circle'));
        }
        if (ownState.state !== 'declined') {
          actionSheetOptions.buttons.push(createActionSheetButton('calevent.unsubscribe', this.store.i18n.invitation_unsubscribe(), this.imgixBaseUrl, 'cancel'));
        }
      }
      // inviting only exists on closed events — an open event is self-service (attendees list)
      if (canChange && showAttendance) {
        actionSheetOptions.buttons.push(createActionSheetDivider());
        if (this.store.canInviteGroup(calevent)) {
          actionSheetOptions.buttons.push(createActionSheetButton('calevent.inviteGroup', this.store.i18n.invite_members(), this.imgixBaseUrl, 'add'));
        }
        actionSheetOptions.buttons.push(createActionSheetButton('calevent.invitePerson', this.store.i18n.invite_person(), this.imgixBaseUrl, 'person-add'));
      }
      // freezing the responses stays available after the event too — the organiser usually locks
      // once the headcount is final, which is often on the day itself
      if (canChange && this.store.invitationsOf(calevent).length > 0) {
        actionSheetOptions.buttons.push(this.store.areInvitationsLocked(calevent)
          ? createActionSheetButton('calevent.unlockInvitations', this.store.i18n.invitation_unlock(), this.imgixBaseUrl, 'lock-open')
          : createActionSheetButton('calevent.lockInvitations', this.store.i18n.invitation_lock(), this.imgixBaseUrl, 'lock-closed'));
      }
    }
    // Show schedule-poll buttons for proposed events
    if (calevent.state === 'proposed') {
      actionSheetOptions.buttons.push(
        createActionSheetButton('calevent.viewSchedule', this.store.i18n.schedule_view(), this.imgixBaseUrl, 'list')
      );
      // the shortcut closes the poll on THIS date alone, which cannot express 'Mehrere Termine
      // festlegen' — such a poll is closed from the table, where several dates can be ticked
      if (canChange && !calevent.pollMultiSelect) {
        actionSheetOptions.buttons.push(
          createActionSheetButton('calevent.closeSchedule', this.store.i18n.schedule_close(), this.imgixBaseUrl, 'lock-closed')
        );
      }
    }
    // a live series: the tabular view answers every upcoming occurrence at once
    if (calevent.seriesId.length > 0 && calevent.state !== 'proposed' && showAttendance) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('calevent.viewSeries', this.store.i18n.series_view(), this.imgixBaseUrl, 'list')
      );
    }

    // notify the participants — organiser megaphone, hidden once the event is past or called off
    // (a cancelled event says it with its own banner, and §1.5 already offered the broadcast there)
    if (showAttendance && calevent.state !== 'cancelled' && this.canNotify(calevent)) {
      actionSheetOptions.buttons.push(createActionSheetDivider());
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.notify', this.store.i18n.notify_label(), this.imgixBaseUrl, 'mail'));
    }

    // organiser actions: one entry; the how (view/call/email/chat) is picked in a follow-up sheet
    if (this.otherOrganisers(calevent).length > 0) {
      actionSheetOptions.buttons.push(createActionSheetDivider());
      actionSheetOptions.buttons.push(createActionSheetButton('organiser.contact', this.store.i18n.organiser_contact(), this.imgixBaseUrl, 'avatar-circle'));
    }

    actionSheetOptions.buttons.push(createActionSheetDivider());
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.downloadIcs', this.store.i18n.download_ics(), this.imgixBaseUrl, 'calendar-number'));
    // No role gate: resolveAlias mints once per event and hands every later caller the same
    // code, so opening this to all registered users cannot grow the alias list per click.
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.copyLink', this.store.i18n.copy_link(), this.imgixBaseUrl, 'link'));

    actionSheetOptions.buttons.push(createActionSheetDivider());
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    if (canChange) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.cancelEvent', this.store.i18n.cancel_event(), this.imgixBaseUrl, 'cancel'));
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.copy', this.store.i18n.copy(), this.imgixBaseUrl, 'copy'));
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }

    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
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
          await this.store.subscribe(calEvent);
          break;
        case 'calevent.unsubscribe':
          await this.store.unsubscribe(calEvent);
          break;
        case 'calevent.downloadIcs':
          await this.download(calEvent.okey);
        break;
        case 'calevent.copyLink':
          await this.store.copyLink(calEvent, window.location.origin);
          break;
        case 'calevent.delete': {
          const isGrid = !this.isListView();
          const viewType = this.currentViewType();
          const targetDate = calEvent.startDate;
          await this.store.delete(calEvent, false);
          if (isGrid) this.navigateCalendarTo(targetDate, viewType);
          break;
        }
        case 'calevent.view':
          await this.store.view(calEvent);
          break;
        case 'calevent.cancelEvent':
          await this.cancelEvent(calEvent);
          break;
        case 'calevent.notify':
          await this.store.notifyParticipants(calEvent);
          break;
        case 'calevent.edit': {
          const isGrid = !this.isListView();
          const viewType = this.currentViewType();
          const saved = await this.store.edit(calEvent, false, false, false, isGrid);
          // navigate to the date of the saved event (it may have been moved), fall back to the original date
          if (isGrid) this.navigateCalendarTo(saved?.startDate ?? calEvent.startDate, viewType);
          break;
        }
        case 'calevent.copy': {
          const isGrid = !this.isListView();
          const viewType = this.currentViewType();
          // a copy is a brand-new SINGLE event: drop identity, series membership, attendances and
          // the recurrence rule — keeping the periodicity would silently mass-create a second
          // series (or, with a repeat-until date already passed, create nothing at all).
          // The user can still turn the copy into a series in the modal.
          // The edit modal deep-clones its input, so a shallow copy is enough here.
          const copy: CalEventModel = { ...calEvent, okey: '', seriesId: '', attendees: [], periodicity: 'once', repeatUntilDate: DEFAULT_DATE };
          const created = await this.store.edit(copy, true, false, true, isGrid);
          if (isGrid && created) this.navigateCalendarTo(created.startDate, viewType);
          break;
        }
        case 'calevent.inviteGroup':
          await this.store.inviteGroupMembers(calEvent, false);
          break;
        case 'calevent.lockInvitations':
          await this.store.lockInvitations(calEvent, true);
          break;
        case 'calevent.unlockInvitations':
          await this.store.lockInvitations(calEvent, false);
          break;
        case 'calevent.invitePerson':
          await this.store.invitePerson(calEvent, false);
          break;
        case 'calevent.viewSchedule':
          await this.openSchedulePoll(calEvent.seriesId);
          break;
        case 'calevent.viewSeries':
          await this.openSeriesAttendance(calEvent);
          break;
        case 'calevent.closeSchedule':
          await this.confirmCloseSchedule(calEvent);
          break;
        case 'organiser.contact':
          await this.contactOrganiser(calEvent);
          break;
      }
    }
  }

  /**
   * Organiser/eventAdmin sets the cancellation message. A non-empty message cancels the event
   * (shown in red everywhere); clearing the text un-cancels it back to 'definitive'.
   */
  /**
   * May this user address the participants?
   *
   * Deliberately NARROWER than `canChange`: it mirrors `mayBroadcast` in
   * `apps/functions/src/calendar/notify.ts` exactly (organiser, eventAdmin, privileged, admin).
   * Offering a button the Cloud Function then refuses is worse than not offering it — the user
   * would type a notice, hit send and get a permission error for their trouble.
   */
  private canNotify(calevent: CalEventModel): boolean {
    const personKey = this.currentUser()?.personKey;
    if (personKey && calevent.responsiblePersons?.some(p => p.key === personKey)) return true;
    return this.hasRole('eventAdmin') || this.hasRole('privileged') || this.hasRole('admin');
  }

  private async cancelEvent(calevent: CalEventModel): Promise<void> {
    const message = await okrPrompt(this.alertController, this.store.i18n.cancel_event(),
      this.store.i18n.cancel_event_placeholder(), this.store.i18n.ok(), this.store.i18n.cancel(), calevent.cancelMessage);
    if (message === undefined) return;
    const cancelMessage = message.trim();
    const updated: CalEventModel = { ...calevent, cancelMessage, state: cancelMessage ? 'cancelled' : 'definitive' };
    await this.store.update(updated, false);

    // §1.5 — a cancellation is exactly the message the participants need, so offer to send it
    // with the reason prefilled. Never automatic: `cancelMessage` can be set quietly today, and
    // a silent mass delivery on a field edit would be a nasty surprise.
    if (cancelMessage && this.canNotify(updated)) {
      const label = formatDateTimeLabel(calevent.startDate, calevent.startTime, calevent.durationMinutes);
      const intro = fill(this.store.i18n.notify_cancel_intro(), { name: calevent.name, date: label, reason: cancelMessage });
      await this.store.notifyParticipants(updated, intro);
    }
  }

  /******************************* organiser actions *************************************** */

  /** The registered-visible contact data of an organiser (address-directory projection). */
  private organiserEmail(personKey: string): string {
    return this.store.appStore.getDirectoryEntry(`person.${personKey}`)?.favEmail ?? '';
  }

  private organiserPhone(personKey: string): string {
    return this.store.appStore.getDirectoryEntry(`person.${personKey}`)?.favPhone ?? '';
  }

  /** The event's responsible persons, without the current user (contacting yourself makes no sense). */
  private otherOrganisers(calevent: CalEventModel): AvatarInfo[] {
    const own = this.currentUser()?.personKey ?? '';
    return (calevent.responsiblePersons ?? []).filter(o => o.key !== own);
  }

  /**
   * Opens the organiser-contact modal: who (dropdown, first one preselected) and how
   * (view/call/email/chat) in one step, then runs the chosen action on the chosen person.
   */
  private async contactOrganiser(calevent: CalEventModel): Promise<void> {
    const organisers = this.otherOrganisers(calevent);
    if (organisers.length === 0) return;
    // resolved here, not in the modal: the directory lookup lives in the store, and call/email
    // must be offered per SELECTED organiser rather than 'anyone on the event has a number'
    const phones: Record<string, string> = {};
    const emails: Record<string, string> = {};
    for (const o of organisers) {
      phones[o.key] = this.organiserPhone(o.key);
      emails[o.key] = this.organiserEmail(o.key);
    }
    const { OrganiserContactModal } = await import('@okr/calevent-ui');
    const modal = await this.modalController.create({
      component: OrganiserContactModal,
      // shrink-to-content: the body is one optional dropdown plus 2-4 action rows, and
      // 'list-modal-wide' is on the fixed-size opt-out list (66% tall, mostly empty)
      cssClass: 'auto-height-modal',
      componentProps: { organisers, i18n: this.store.i18n, phones, emails },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<OrganiserContactResult>();
    if (role !== 'confirm' || !data) return;
    await this.organiserAction(data.action, data.organiser);
  }

  /** Runs an organiser action on the person picked in the contact modal. */
  private async organiserAction(action: OrganiserContactAction, organiser: AvatarInfo): Promise<void> {
    switch (action) {
      case 'view': await this.showPerson(organiser.key); break;
      case 'chat': await this.chatWith(organiser.key); break;
      case 'call': {
        const phone = this.organiserPhone(organiser.key);
        if (phone) await browseUrl(`tel:${phone}`);
        break;
      }
      case 'email': {
        const email = this.organiserEmail(organiser.key);
        if (email) await browseUrl(`mailto:${email}`);
        break;
      }
    }
  }

  /** Opens the person page. Navigation, not the PersonEditModal: importing @okr/subject-person-feature
   *  here would close a lib dependency cycle (person-feature -> … -> reservation-feature -> calevent-feature). */
  private async showPerson(personKey: string): Promise<void> {
    // the person page's close button calls AppNavigationService.back(), which pops the top entry and
    // navigates to the one below -> seed the history so that it returns to this calendar view.
    this.appNavigationService.resetLinkHistory(this.router.url);
    this.appNavigationService.pushLink(`/person/${personKey}`);
    await navigateByUrl(this.router, `/person/${personKey}`);
  }

  /** Opens (or creates) the direct chat room with the given person — same flow as PersonStore.chat(). */
  private async chatWith(personKey: string): Promise<void> {
    try {
      await this.matrixChatService.ensureInitialized();
      const room = await this.matrixChatService.createDirectRoom(personKey);
      await navigateByUrl(this.router, '/private/chat/c-contentpage', { selectedRoom: room.roomId });
    } catch (err) {
      warn(`CalEventList.chatWith: could not open the direct chat with ${personKey}: ${err}`);
    }
  }

  private async openSchedulePoll(seriesId: string): Promise<void> {
    const { ScheduleModal } = await import('./schedule.modal');
    const modal = await this.modalController.create({
      component: ScheduleModal,
      cssClass: 'wide-modal',
      componentProps: { seriesId },
      injector: this.injector,   // share CalEventList's CalEventStore instance with the root-injected modal
    });
    await modal.present();
    await modal.onDidDismiss();
  }

  /**
   * Opens the tabular attendance view of a series. On close the list always returns to the calendar
   * on the week of the series' first upcoming occurrence — that is where the user's answers now sit.
   * The series is re-read afterwards so the target date reflects any answer just saved.
   */
  private async openSeriesAttendance(calevent: CalEventModel): Promise<void> {
    const { SeriesAttendanceModal } = await import('./series-attendance.modal');
    const modal = await this.modalController.create({
      component: SeriesAttendanceModal,
      cssClass: 'wide-modal',
      componentProps: { seriesId: calevent.seriesId },
      injector: this.injector,   // share CalEventList's CalEventStore instance with the root-injected modal
    });
    await modal.present();
    await modal.onDidDismiss();

    const series = await this.store.loadSeriesEvents(calevent.seriesId);
    const first = upcomingOccurrences(series)[0];
    this.onViewChange(false);
    this.navigateCalendarTo(first?.startDate ?? calevent.startDate, 'timeGridWeek');
  }

  private async confirmCloseSchedule(calevent: CalEventModel): Promise<void> {
    const formattedDate = convertDateFormatToString(calevent.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
    const alert = await this.alertController.create({
      header: this.store.i18n.schedule_close(),
      message: this.store.i18n.schedule_close_message().replace('{date}', formattedDate),
      inputs: [{ name: 'authorMessage', type: 'textarea', placeholder: this.store.i18n.schedule_optional_message() }],
      buttons: [
        { text: this.store.i18n.cancel(), role: 'cancel' },
        {
          text: this.store.i18n.schedule_close(),
          handler: (data: { authorMessage?: string }) => {
            this.store.closeSchedule([calevent], data.authorMessage)
              .catch(err => console.warn('confirmCloseSchedule: closeSchedule failed:', err));
          },
        },
      ],
    });
    await alert.present();
  }

  /** Whether the filter row is currently visible. Public so a parent (group view) can reflect it in a hoisted toggle menu item. */
  public isFilterVisible(): boolean {
    return this.showFilter();
  }

  /** Flip between list and calendar view. Public so a parent toolbar (group view) can drive the hoisted toggle. */
  public toggleView(): void {
    this.onViewChange(!this.isListView());
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
      const viewType = currentView;
      const created = await this.store.add(false, startDate, startTime, true);
      this.navigateCalendarTo(created?.startDate ?? startDate, viewType);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onEventDrop(arg: any): Promise<void> {
    if (!this.canChange()) { arg.revert(); return; }
    const eventKey = arg.event.extendedProps?.eventKey as string;
    if (!eventKey) { arg.revert(); return; }
    const calevent = this.filteredCalEvents().find(e => e.okey === eventKey);
    if (!calevent) { arg.revert(); return; }
    const start = arg.event.start as Date;
    const newStartDate = format(start, DateFormat.StoreDate);
    const updated: CalEventModel = { ...calevent, startDate: newStartDate, startTime: format(start, 'HH:mm') };
    const saved = await this.store.update(updated, false);
    if (!saved) arg.revert();
    else this.navigateCalendarTo(newStartDate);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onEventResize(arg: any): Promise<void> {
    const eventKey = arg.event.extendedProps?.eventKey as string;
    if (!eventKey) { arg.revert(); return; }
    const calevent = this.filteredCalEvents().find(e => e.okey === eventKey);
    if (!calevent || !this.canChange(calevent)) { arg.revert(); return; }
    const start = arg.event.start as Date;
    const end = arg.event.end as Date;
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const newStartDate = format(start, DateFormat.StoreDate);
    const updated: CalEventModel = { ...calevent, startDate: newStartDate, startTime: format(start, 'HH:mm'), endDate: format(end, DateFormat.StoreDate), durationMinutes };
    const saved = await this.store.update(updated, false);
    if (!saved) arg.revert();
    else this.navigateCalendarTo(newStartDate);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async onEventClick(arg: any) {
    const eventKey = arg.event.extendedProps.eventKey as string;
    debugData<string>('CaleventList.onEventClick: event selected: ', eventKey, this.currentUser());
    const calevents = this.filteredCalEvents();
    const calevent = calevents.find(e => e.okey === eventKey);
    if (calevent) {
      await this.showActions(calevent);
    } else {
      warn('CalEventList.onEventClick: calEvent ' + eventKey + ' not found');
    }
  }

  /******************************* helpers *************************************** */

  /** The FullCalendar view the user is currently on ('timeGridWeek', 'dayGridMonth', …). */
  private currentViewType(): string | undefined {
    return this.fullCalendar()?.getApi()?.view.type;
  }

  /** Navigate the FullCalendar to the period containing the given storeDate (YYYYMMDD), restoring
   *  the view the user came from (a click may have switched week -> day while the modal opened).
   *  Uses a 300ms delay to let the post-save reload complete before navigating. */
  private navigateCalendarTo(storeDate: string, viewType?: string): void {
    if (!storeDate || storeDate.length < 8) return;
    const iso = `${storeDate.slice(0,4)}-${storeDate.slice(4,6)}-${storeDate.slice(6,8)}`;
    setTimeout(() => {
      const api = this.fullCalendar()?.getApi();
      if (!api) return;
      if (viewType && viewType !== api.view.type) api.changeView(viewType, iso);
      else api.gotoDate(iso);
    }, 300);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  /**
   * Attendance state of the current user for the given event: open events read it from the attendees list,
   * closed ones from the invitation. Falls back to 'invited' (the '?' icon) while the user has not
   * answered yet but still could, and to undefined when An-/Abmeldung is not possible at all
   * (past event, or a closed event the user was not invited to) — the list then shows the 'remove' icon.
   */
  protected attendanceState(event: CalEventModel): AttendanceState | undefined {
    const hasInvitation = this.store.invitations().some(inv => inv.caleventKey === event.okey);
    const state = event.isOpen
      ? getAttendanceState(event, this.currentUser()?.personKey ?? '')
      // no invitation (e.g. the organiser of a personal event) -> fall back to the attendees list
      : this.store.invitations().find(inv => inv.caleventKey === event.okey)?.state
        ?? getAttendanceState(event, this.currentUser()?.personKey ?? '');
    if (!state) return canAttendCalevent(event, hasInvitation, this.mayJoinOpen(event)) ? 'invited' : undefined;
    return state === 'accepted' || state === 'declined' ? state : 'invited';
  }

  /**
   * Whether the current user is let into this event's open sign-up. Only a group calendar narrows
   * it, and then to that group's members — see `mayJoinOpenCalevent`.
   */
  protected mayJoinOpen(event: CalEventModel): boolean {
    return mayJoinOpenCalevent(event.calendars, this.store.groupCalendarKeys(), this.store.calendarsOfCurrentUser());
  }

  protected cycleAttendanceFilter(): void {
    const values: AttendanceFilter[] = ['all', 'accepted', 'declined', 'invited'];
    this.attendanceFilter.update(current => values[(values.indexOf(current) + 1) % values.length]);
  }

  protected getAttendanceIcon = getAttendanceIcon;
  protected getAttendanceColor = getAttendanceColor;

  /**
   * CalendarEvents may be created, changed or deleted by the following users:
   * - user has role eventAdmin or privileged
   * - user is responsiblePerson of the calevent
   * - if calevent is part of a group calendar: user is admin of that group
   * @param calevent 
   * @returns 
   */
  public canChange(calevent?: CalEventModel): boolean {
    // 0) personal calendar: any registered user may create an event there. Per-event rights still
    //    come from step 3 (responsiblePersons), so an invitee stays read-only on someone else's event.
    if (this.isPersonalCalendar() && !calevent) return true;
    // 1) general roles
    if (this.hasRole('eventAdmin')) return true;
    if (this.hasRole('privileged')) return true;
    if (this.groupAdmin()) return true;

    const personKey = this.currentUser()?.personKey;
    if (!personKey) return false;

    // 2) group calendar: check if currentUser is admin of the owning group
    if (calevent) {
      const allCalendars = this.store.calendarsResource.value() ?? [];
      for (const calKey of calevent.calendars) {
        const cal = allCalendars.find(c => c.okey === calKey);
        if (cal?.owner?.startsWith('group.')) {
          const group = this.store.appStore.getGroup(cal.owner.substring(6));
          return isAdminMember(group, personKey);        }
      }
    }

    // 3) responsible person on the calevent
    if (calevent?.responsiblePersons?.some(p => p.key === personKey)) return true;

    return false;
  }

  protected async download(key: string): Promise<void> {
    const url = `${ICS_FUNCTION_URL}?calendar=e:${key}`;
    await Browser.open({ url, windowName: '_blank' });
  }
}
