import { isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, PLATFORM_ID, computed, effect, inject, input, viewChild } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';

import { CalendarSection } from '@bk2/shared-models';
import { SpinnerComponent } from '@bk2/shared-ui';
import { addTime, debugData, debugMessage, getCalendarTitle, getIsoDateTime } from '@bk2/shared-util-core';

import { CalendarStore } from './calendar-section.store';

@Component({
  selector: 'bk-calendar-section',
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
      full-calendar {
        width: 100%;
        height: 800px;
      }
      .fc-toolbar-title {
        font-size: 0.5em;
      }

      @media (max-width: 600px) {
        :host ::ng-deep .fc-toolbar-title {
          display: none !important;
        } 
      }
    `,
  ],
  providers: [CalendarStore],
  imports: [
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
          {{ filteredEvents().length }} events loaded.
          <full-calendar #fullCalendar [options]="calendarOptions" [events]="calendarEvents()" />
        </div>
      </ion-card-content>
    </ion-card>
    }
  `,
})
export class CalendarSectionComponent implements OnInit {
  protected calendarStore = inject(CalendarStore);
  private readonly platformId = inject(PLATFORM_ID);

  // inputs
  public section = input<CalendarSection>();
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
      title: event.name,
      start: getIsoDateTime(event.startDate, event.startTime),
      end: getIsoDateTime(event.endDate || event.startDate, addTime(event.startTime, 0, event.durationMinutes)),
      extendedProps: { eventKey: event.bkey },
      backgroundColor: '#3788d8', // optional
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
      this.calendarStore.setCalendarName(this.section()?.name);
      const calName = this.section()?.name ?? 'undefined';
      debugMessage(`CalendarSection(): calendarName=${calName}`, this.calendarStore.currentUser());
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
  onDateClick(arg: any) {
    debugData<unknown>('CalendarSection(): onDateClick: ', arg);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async onEventClick(arg: any) {
    debugMessage('CalendarSection.onEventClick: event selected', this.calendarStore.currentUser());
    debugData<string>('event: ', arg);
    debugData<string>('title: ', arg.event.title);
    debugData<string>('start: ', arg.event.startStr);
    const eventKey = arg.event.extendedProps.eventKey;
    debugData<unknown>('event selected: ', eventKey);
    /* const event = await firstValueFrom(this.eventService.readEvent(eventKey));
    if (!event) {
      warn('CalendarSectionComponent.onEventClick: event ' + eventKey + ' not found');
    } else {
      await this.eventService.editEvent(event);
    } */
  }
}
