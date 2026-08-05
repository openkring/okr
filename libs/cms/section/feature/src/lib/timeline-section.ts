import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { TimelineSection } from '@okr/shared-models';
import { toTimelineEntries, withTimelineDefaults } from '@okr/cms-section-util';
import { EmptyList, OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { PrettyDatePipe } from '@okr/shared-pipes';

import { CalendarStore } from './calendar-section.store';

/**
 * A chronology of one calendar: every event of the calendar named in `section.name`, oldest first,
 * with its title, its date and — if the event carries a `url` — a small image.
 *
 * Rendered as plain markup, not as an echarts chart (→ spec 2.36): a CSS scroll-snap row
 * (horizontal, the default) or a stacked column (vertical) themes and reflows on a phone in a way
 * a canvas does not. Past and upcoming events are both shown; a chronology that starts today is
 * not a chronology.
 */
@Component({
  selector: 'okr-timeline-section',
  standalone: true,
  providers: [CalendarStore],
  imports: [PrettyDatePipe, EmptyList, OptionalCardHeader, Spinner, IonCard, IonCardContent],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }

    ol { list-style: none; margin: 0px; padding: 0px; }

    .horizontal {
      display: flex;
      gap: 24px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      padding: 8px 0px 16px 0px;
      border-bottom: 2px solid var(--ion-color-medium);
    }
    .horizontal > li { flex: 0 0 200px; scroll-snap-align: start; }

    .vertical { display: flex; flex-direction: column; gap: 24px; padding: 8px 0px 8px 16px; border-left: 2px solid var(--ion-color-medium); }

    li { position: relative; }
    li::before {
      content: '';
      position: absolute;
      width: 10px; height: 10px;
      border-radius: 50%;
      background: var(--ion-color-primary);
    }
    .horizontal > li::before { bottom: -21px; left: 0px; }
    .vertical > li::before { top: 6px; left: -21px; }

    .date { display: block; font-size: 0.85rem; font-weight: 600; color: var(--ion-color-primary); }
    .title { display: block; margin-top: 2px; }
    img { margin-top: 8px; width: 100%; max-width: 180px; height: 100px; object-fit: cover; border-radius: 8px; }
  `],
  template: `
  @if(section(); as section) {
    <ion-card>
      <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        @if(entries().length === 0) {
          <okr-empty-list [message]="store.i18n.timeline_empty()" />
        } @else {
          <ol [class]="vertical() ? 'vertical' : 'horizontal'" [attr.aria-label]="store.i18n.timeline_list_label()">
            @for(entry of entries(); track entry.okey) {
              <li>
                <span class="date">{{ entry.date | prettyDate:false }}</span>
                <span class="title">{{ entry.title }}</span>
                @if(entry.imageUrl) {
                  <img [src]="entry.imageUrl" [alt]="entry.title" loading="lazy" />
                }
              </li>
            }
          </ol>
        }
      </ion-card-content>
    </ion-card>
  } @else {
    <okr-spinner />
  }
`
})
export class TimelineSectionComponent {
  protected readonly store = inject(CalendarStore);

  // inputs
  public section = input<TimelineSection>();

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  private readonly calendarName = computed(() => this.section()?.name);
  protected readonly vertical = computed(() => withTimelineDefaults(this.section()?.properties).orientation === 'vertical');
  protected readonly entries = computed(() => toTimelineEntries(this.store.calevents()));

  constructor() {
    effect(() => {
      const calendarName = this.calendarName();
      untracked(() => this.store.setConfig(calendarName, undefined, true, true));
    });
  }
}
