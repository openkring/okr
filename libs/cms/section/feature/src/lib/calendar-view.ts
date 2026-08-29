import { CUSTOM_ELEMENTS_SCHEMA, Component, PLATFORM_ID,
         computed, inject, input, output, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import type { CalendarOptions, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import timeGridPlugin from '@fullcalendar/timegrid';

/**
 * Reines FullCalendar-Rendering. Bewusst frei von @okr/*-Importen, damit esbuild diese Datei
 * nicht mit einem eager benötigten Modul in denselben Chunk legen kann — siehe
 * planning/specs/2026-08-29-dashboard-lazy-charts-design.md, §2.
 */
@Component({
  selector: 'okr-calendar-view',
  standalone: true,
  imports: [FullCalendarModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    full-calendar { width: 100%; }
    .fc-toolbar-title { font-size: 0.5em; }
    @media (max-width: 600px) {
      :host ::ng-deep .fc-toolbar-title { font-size: 1em; }
    }
  `],
  template: `
    <full-calendar #fullCalendar
      [options]="calendarOptions()"
      [events]="events()"
      (dateClick)="dateClick.emit($event)"
      (eventDrop)="eventDrop.emit($event)"
      (eventResize)="eventResize.emit($event)"
    />
  `,
})
export class CalendarView {
  private readonly platformId = inject(PLATFORM_ID);
  private fullCalendar = viewChild<FullCalendarComponent>('fullCalendar');

  public events = input.required<EventInput[]>();
  public props = input<CalendarOptions>({});
  public isMobile = input<boolean>(false);

  public readonly dateClick = output<unknown>();
  public readonly eventDrop = output<unknown>();
  public readonly eventResize = output<unknown>();

  protected calendarOptions = computed<CalendarOptions>(() => {
    const props = this.props();
    const mobile = this.isMobile();
    return {
      plugins: [dayGridPlugin, interactionPlugin, timeGridPlugin, listPlugin],
      initialView: mobile ? 'listWeek' : (props.initialView ?? 'timeGridWeek'),
      headerToolbar: mobile
        ? { left: 'prev,next', center: 'title', right: 'listWeek,dayGridMonth' }
        : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
      navLinks: mobile,
      navLinkDayClick: mobile ? 'listDay' : undefined,
      locale: 'de',
      firstDay: 1,
      height: 'auto',
      slotMinTime: props.slotMinTime ?? '05:00:00',
      slotMaxTime: props.slotMaxTime ?? '22:00:00',
      weekNumbers: props.weekNumbers ?? true,
      editable: props.editable ?? true,
      views: {
        timeGridWeek: { titleFormat: 'W' },
        dayGridMonth: { titleFormat: 'MMM YYYY' },
        month: { titleFormat: 'MMM YYYY' },
        week: { titleFormat: 'W' },
        day: { titleFormat: 'D MM YYYY' },
      },
    };
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // FullCalendar rendert in Ionic zu früh (ngAfterViewInit); ein Resize-Event nach 1 ms
      // zwingt es zum Neuzeichnen. Übernommen aus calendar-section.ts.
      setTimeout(() => window.dispatchEvent(new Event('resize')), 1);
    }
  }

  /** Wechselt auf die Wochenansicht um das gegebene Datum. */
  public gotoWeek(date: Date): void {
    this.fullCalendar()?.getApi()?.changeView('timeGridWeek', date);
  }
}
