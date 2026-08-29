import { CUSTOM_ELEMENTS_SCHEMA, Component, ComponentRef, DestroyRef, PLATFORM_ID, ViewContainerRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import type { CalendarOptions, EventInput } from '@fullcalendar/core';
import { format } from 'date-fns';

import { CalendarSection, CalEventModel } from '@okr/shared-models';
import { Spinner } from '@okr/shared-ui';
import { DateFormat, debugData, debugMessage, parseDate } from '@okr/shared-util-core';
import { isBrowser } from '@okr/shared-util-angular';

import { convertCalEventToFullCalendar } from '@okr/calevent-util';
import { CalEventStore } from '@okr/calevent-feature';

import { CalendarStore } from './calendar-section.store';
import type { CalendarView } from './calendar-view';

@Component({
  selector: 'okr-calendar-section',
  standalone: true,
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    /* no fixed height: the calendar uses height:'auto' and must size to its content,
       otherwise the last hours of the time grid get clipped on narrow screens. */
    full-calendar { width: 100%; }
    .fc-toolbar-title { font-size: 0.5em; }

    @media (max-width: 600px) {
      :host ::ng-deep .fc-toolbar-title { font-size: 1em; }
    }
  `],
  providers: [CalendarStore, CalEventStore],
  imports: [
    Spinner,
    IonCard, IonCardContent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if(isLoading()) {
    <okr-spinner />
    } @else {
    <ion-card>
      <!-- <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" /> -->
      <ion-card-content>
        <div [style.display]="'block'">
          {{ filteredEvents().length }} {{ calendarStore.i18n.calevents() }}
          @if (!componentRef()) {
            <okr-spinner />
          }
          <div #calendarHost></div>
        </div>
      </ion-card-content>
    </ion-card>
    }
  `,
})
export class CalendarSectionComponent {
  protected calendarStore = inject(CalendarStore);
  protected calEventStore = inject(CalEventStore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  /** Tracks whether the viewport is narrow (phones), so the calendar can switch to a mobile-friendly agenda/month list. */
  protected readonly isMobile = signal(false);

  // inputs
  public section = input<CalendarSection>();
  public editMode = input<boolean>(false);
  private calendarHost = viewChild('calendarHost', { read: ViewContainerRef });
  protected readonly componentRef = signal<ComponentRef<CalendarView> | undefined>(undefined);

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly calendarName = computed(() => this.section()?.name);
  protected isLoading = computed(() => this.calendarStore.isLoading());
  protected filteredEvents = computed(() => this.calendarStore.calevents());
  protected calendarEvents = computed<EventInput[]>(() => {
    return this.filteredEvents().map(event => ({
      ...convertCalEventToFullCalendar(event),
      extendedProps: { eventKey: event.okey },
      backgroundColor: '#3788d8',
      borderColor: '#3788d8'
    }));
  });

  // The editable subset (initialView, slot times, weekNumbers, editable) comes from
  // the section's saved properties; plugins/toolbar/locale stay as code defaults.
  protected calendarProps = computed<CalendarOptions>(
    () => (this.section()?.properties ?? {}) as CalendarOptions);

  constructor() {
    if (isBrowser(this.platformId)) {
      const mql = window.matchMedia('(max-width: 600px)');
      this.isMobile.set(mql.matches);
      const onChange = (e: MediaQueryListEvent) => this.isMobile.set(e.matches);
      mql.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => mql.removeEventListener('change', onChange));
    }
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
    effect(async () => {
      const host = this.calendarHost();
      if (!host || untracked(() => this.componentRef()) || !isBrowser(this.platformId)) return;
      const { CalendarView } = await import('./calendar-view');
      const ref = host.createComponent(CalendarView);
      this.componentRef.set(ref);
      ref.instance.dateClick.subscribe((e: unknown) => this.onDateClick(e));
      ref.instance.eventDrop.subscribe((e: unknown) => this.onEventDrop(e));
      ref.instance.eventResize.subscribe((e: unknown) => this.onEventResize(e));
    });
    effect(() => {
      const ref = this.componentRef();
      const events = this.calendarEvents();
      const props = this.calendarProps();
      const mobile = this.isMobile();
      if (!ref) return;
      ref.setInput('events', events);
      ref.setInput('props', props);
      ref.setInput('isMobile', mobile);
    });
    this.destroyRef.onDestroy(() => this.componentRef()?.destroy());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onDateClick(arg: any): Promise<void> {
    if (this.editMode()) return;
    const date = arg.date as Date;
    const startDate = format(date, DateFormat.StoreDate);
    const startTime = format(date, 'HH:mm');
    const created = await this.calEventStore.add(false, startDate, startTime);
    // after creating a new event, jump to the weekly view of that event's start date
    if (created) this.gotoWeekOf(created.startDate);
  }

  /** Switch the calendar to the weekly view focused on the given store date (yyyyMMdd). */
  private gotoWeekOf(storeDate: string): void {
    const date = parseDate(storeDate, DateFormat.StoreDate, false);
    if (date) this.componentRef()?.instance.gotoWeek(date);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async onEventDrop(arg: any): Promise<void> {
    console.log('CalendarSection.onEventDrop: ', arg);
    if (this.editMode()) { arg.revert(); return; }
    const eventKey = arg.event.extendedProps?.eventKey as string;
    if (!eventKey) { arg.revert(); return; }
    const calevent = this.filteredEvents().find((e: CalEventModel) => e.okey === eventKey);
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
    const calevent = this.filteredEvents().find((e: CalEventModel) => e.okey === eventKey);
    if (!calevent) { arg.revert(); return; }
    const start = arg.event.start as Date;
    const end = arg.event.end as Date;
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const updated: CalEventModel = { ...calevent, startDate: format(start, DateFormat.StoreDate), startTime: format(start, 'HH:mm'), endDate: format(end, DateFormat.StoreDate), durationMinutes };
    const saved = await this.calEventStore.edit(updated, false, false, true);
    if (!saved) arg.revert();
  }
}
