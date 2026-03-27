import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, PLATFORM_ID, computed, effect, inject, input, viewChild } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { format } from 'date-fns';

import { CalendarSection, CalEventModel } from '@bk2/shared-models';
import { SpinnerComponent } from '@bk2/shared-ui';
import { DateFormat, debugData, debugMessage } from '@bk2/shared-util-core';
import { convertCalEventToFullCalendar } from '@bk2/calevent-util';
import { CalEventStore } from '@bk2/calevent-feature';

import { CalendarStore } from './calendar-section.store';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-calendar-section',
  standalone: true,
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    full-calendar { width: 100%; height: 800px;}
    .fc-toolbar-title { font-size: 0.5em; }

    @media (max-width: 600px) {
      :host ::ng-deep .fc-toolbar-title {
        display: none !important;
      } 
    }
  `],
  providers: [CalendarStore, CalEventStore],
  imports: [
    TranslatePipe, AsyncPipe,
    FullCalendarModule,
    SpinnerComponent, 
    IonCard, IonCardContent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if(isLoading()) {
    <bk-spinner />
    } @else {
    <ion-card>
      <!-- <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" /> -->
      <ion-card-content>
        <div [style.display]="'block'">
          {{ filteredEvents().length }} {{'@calevent.plural' | translate | async}}
          <full-calendar #fullCalendar 
            [options]="calendarOptions"
            [events]="calendarEvents()"
            (dateClick)="onDateClick($event)"
            (eventDrop)="onEventDrop($event)"
            (eventResize)="onEventResize($event)"
          />
        </div>
      </ion-card-content>
    </ion-card>
    }
  `,
})
export class CalendarSectionComponent implements OnInit {
  protected calendarStore = inject(CalendarStore);
  protected calEventStore = inject(CalEventStore);
  private readonly platformId = inject(PLATFORM_ID);

  // inputs
  public section = input<CalendarSection>();
  public editMode = input<boolean>(false);
  private fullCalendar = viewChild<FullCalendarComponent>('fullCalendar');

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly calendarName = computed(() => this.section()?.name);
  //protected readonly calendarOptions = computed(() => this.section()?.properties);
  protected isLoading = computed(() => this.calendarStore.isLoading());
  protected filteredEvents = computed(() => this.calendarStore.calevents());
  protected calendarEvents = computed<EventInput[]>(() => {
    return this.filteredEvents().map(event => ({
      ...convertCalEventToFullCalendar(event),
      extendedProps: { eventKey: event.bkey },
      backgroundColor: '#3788d8',
      borderColor: '#3788d8'
    }));
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
    firstDay: 1,
    height: 'auto',
    slotMinTime: '05:00:00',
    slotMaxTime: '22:00:00',
    weekNumbers: true,
    editable: true,
  };

  constructor() {
    effect(() => {
      const name = this.section()?.name;
      if (name) {
        this.calendarStore.setCalendarName(name);
        this.calEventStore.setCalendarName(name);
      }
      debugMessage(`CalendarSection(): calendarName=${name ?? 'undefined'}`, this.calendarStore.currentUser());
    });
    effect(() => {
      debugData<EventInput[]>('CalendarSection(): events: ', this.filteredEvents(), this.calendarStore.currentUser());
    });
    const calendarApi = this.fullCalendar()?.getApi();
    if (calendarApi) {
      calendarApi.setOption('views', {
        timeGridWeek: { titleFormat: 'W' },
        dayGridMonth: { titleFormat: 'MMM YYYY' },
        month: { titleFormat: 'MMM YYYY' },
        week: { titleFormat: 'W' },
        day: { titleFormat: 'D MM YYYY' }
      });
      calendarApi.render();
    }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected onDateClick(arg: any): void {
    console.log('CalendarSection.onDateClick: ', arg);
    if (this.editMode()) return;
    const date = arg.date as Date;
    const startDate = format(date, DateFormat.StoreDate);
    const startTime = format(date, 'HH:mm');
    this.calEventStore.add(false, startDate, startTime);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onEventDrop(arg: any): Promise<void> {
    console.log('CalendarSection.onEventDrop: ', arg);
    if (this.editMode()) { arg.revert(); return; }
    const eventKey = arg.event.extendedProps?.eventKey as string;
    if (!eventKey) { arg.revert(); return; }
    const calevent = this.filteredEvents().find((e: CalEventModel) => e.bkey === eventKey);
    if (!calevent) { arg.revert(); return; }
    const start = arg.event.start as Date;
    const updated: CalEventModel = { ...calevent, startDate: format(start, DateFormat.StoreDate), startTime: format(start, 'HH:mm') };
    const saved = await this.calEventStore.edit(updated, false, false, true);
    if (!saved) arg.revert();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onEventResize(arg: any): Promise<void> {
    if (this.editMode()) { arg.revert(); return; }
    const eventKey = arg.event.extendedProps?.eventKey as string;
    if (!eventKey) { arg.revert(); return; }
    const calevent = this.filteredEvents().find((e: CalEventModel) => e.bkey === eventKey);
    if (!calevent) { arg.revert(); return; }
    const start = arg.event.start as Date;
    const end = arg.event.end as Date;
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const updated: CalEventModel = { ...calevent, startDate: format(start, DateFormat.StoreDate), startTime: format(start, 'HH:mm'), endDate: format(end, DateFormat.StoreDate), durationMinutes };
    const saved = await this.calEventStore.edit(updated, false, false, true);
    if (!saved) arg.revert();
  }
}
