import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, input, viewChild } from '@angular/core';

import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import type { CalendarApi, CalendarOptions } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';

/**
 * Reines FullCalendar-Rendering für die Calevent-Liste. Bewusst frei von @okr/*-Importen, damit
 * esbuild diese Datei nicht mit einem eager benötigten Modul in denselben Chunk legen kann — siehe
 * planning/specs/2026-08-29-dashboard-lazy-charts-design.md, §2.
 */
@Component({
  selector: 'okr-calevent-fullcalendar-view',
  standalone: true,
  imports: [FullCalendarModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    :host { display: block; width: 100%; }
    full-calendar { width: 100%; }
  `],
  template: `
    <full-calendar #fullCalendar [options]="mergedOptions()" />
  `,
})
export class CaleventFullcalendarView {
  private readonly fullCalendar = viewChild<FullCalendarComponent>('fullCalendar');

  /** Every option except `plugins` — the caller (CalEventList) builds this without importing
   *  any @fullcalendar/* value, so plugins are merged in here instead. */
  public options = input.required<CalendarOptions>();

  protected mergedOptions = computed<CalendarOptions>(() => ({
    plugins: [dayGridPlugin, interactionPlugin, timeGridPlugin],
    ...this.options(),
  }));

  /** Exposes the underlying FullCalendar API for imperative navigation (today/gotoDate/changeView/updateSize). */
  public getApi(): CalendarApi | undefined {
    return this.fullCalendar()?.getApi();
  }
}
