import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, computed, effect, inject, input, PLATFORM_ID } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';
import { FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarOptions, EventInput } from '@fullcalendar/core';
import { isPlatformBrowser } from '@angular/common';

import { SectionModel } from '@bk2/shared/models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared/ui';
import { debugData, debugMessage, die } from '@bk2/shared/util-core';
import { CalendarStore } from './calendar-section.store';

@Component({
  selector: 'bk-calendar-section',
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    full-calendar { width: 100%; height: 800px; }
    .fc-toolbar-title { font-size: 1em; }
  `],
  providers: [CalendarStore],
  imports: [
    FullCalendarModule, OptionalCardHeaderComponent, SpinnerComponent,
    IonCard, IonCardContent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if(isLoading()) {
      <bk-spinner />
    } @else {      
      <ion-card>
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <ion-item>
            <full-calendar 
              [options]="calendarOptions()"
              [events]="filteredEvents()"
            />
          </ion-item>
        </ion-card-content>
      </ion-card>
    }
  `
})
export class CalendarSectionComponent implements OnInit {
  protected calendarStore = inject(CalendarStore);
  private readonly platformId = inject(PLATFORM_ID);
  public section = input<SectionModel>();

  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly calendarName = computed(() => this.section()?.name);
  protected readonly calendarOptions = computed(() => {
    const _options = this.section()?.properties.calendarOptions as CalendarOptions?? die('CalendarSectionComponent.calendarOptions: missing calendarOptions');
    _options.plugins = [ dayGridPlugin, interactionPlugin, timeGridPlugin ];
    _options.dateClick = (arg) => { this.onDateClick(arg); }
    _options.eventClick = (arg) => { this.onEventClick(arg); }
    return _options;
  });
  protected isLoading = computed(() => this.calendarStore.isLoading());
  protected filteredEvents = computed(() => this.calendarStore.filteredEvents());
  
  constructor() {
    effect(() => {
      this.calendarStore.setCalendarName(this.section()?.name);
      const _calName = this.section()?.name ?? 'undefined';
      debugMessage(`CalendarSection(): calendarName=${_calName}`, this.calendarStore.currentUser());
    });
    effect(() => {
      debugData<EventInput[]>('CalendarSection(): events: ', this.filteredEvents());
    });
  }

  async ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // angular component calls render() from ngAfterViewInit() which is too early for fullcalendar in Ionic (should be in ionViewDidLoad())
      // the calendar renders correctly if render() is called after the page is loaded, e.g. by resizing the window.
      // that's what this hack is doing: trigger resize window after 1ms
      setTimeout( function() {
        window.dispatchEvent(new Event('resize'))
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
    const _eventKey = arg.event.extendedProps.eventKey;
    debugData<unknown>('event selected: ', _eventKey);
    /* const _event = await firstValueFrom(this.eventService.readEvent(_eventKey));
    if (!_event) {
      warn('CalendarSectionComponent.onEventClick: event ' + _eventKey + ' not found');
    } else {
      await this.eventService.editEvent(_event);
    } */
  }
}