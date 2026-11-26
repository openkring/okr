import { Component, computed, input, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular';

import { AttendeeState, MandateModel, MeetingAttendee } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import { MeetingI18n, countPresent, proxyHolderName } from '@okr/calendar-meeting-util';
import { proxiesHeldBy, proxyFor } from '@okr/relationship-mandate-util';

/**
 * Attendance record of one meeting — one segment per person, four states.
 *
 * Proxies (Vollmacht, spec 1.180 §6) are read from `proxies`, never from the attendance: a grantor's row says
 * «vertreten durch {Name}», a holder's row «+n Vollmacht». «Vollmacht erfassen» shows on the rows listed in
 * `recordProxyFor` (the parent decides who may record what) and emits the grantor's personKey — also in read-only
 * mode, because a plain attendee views the meeting read-only and may still record their own proxy.
 */
@Component({
  selector: 'okr-attendee-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonNote, IonSegment, IonSegmentButton, IonButton, IonIcon,
  ],
  styles: [`ion-segment { max-width: 340px; } ion-segment-button { min-width: 70px; } .proxy-action { margin: 0; }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().attendees_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if (attendees(); as attendees) {
          @if (attendees.length === 0) {
            <ion-item lines="none">
              <ion-note>{{ i18n().attendees_empty() }}</ion-note>
            </ion-item>
          } @else {
            <ion-list>
              @for (attendee of attendees; track attendee.person.key) {
                <ion-item>
                  <ion-label>
                    {{ attendee.person.name1 }} {{ attendee.person.name2 }}
                    @if (representedBy(attendee.person.key); as note) {
                      <p>{{ note }}</p>
                    }
                    @if (holdsProxies(attendee.person.key); as note) {
                      <p>{{ note }}</p>
                    }
                    @if (canRecord(attendee.person.key)) {
                      <ion-button class="proxy-action" fill="clear" size="small" (click)="recordProxy.emit(attendee.person.key)">
                        <ion-icon slot="start" src="{{ 'person-add' | svgIcon }}" />
                        {{ i18n().proxy_record() }}
                      </ion-button>
                    }
                  </ion-label>
                  <ion-segment
                    slot="end"
                    [disabled]="isReadOnly()"
                    [value]="attendee.state"
                    (ionChange)="setState(attendee.person.key, $any($event).detail.value)">
                    <ion-segment-button value="present"><ion-label>{{ i18n().attendees_present() }}</ion-label></ion-segment-button>
                    <ion-segment-button value="excused"><ion-label>{{ i18n().attendees_excused() }}</ion-label></ion-segment-button>
                    <ion-segment-button value="absent"><ion-label>{{ i18n().attendees_absent() }}</ion-label></ion-segment-button>
                  </ion-segment>
                </ion-item>
              }
            </ion-list>
            <ion-item lines="none">
              <ion-note>{{ i18n().attendees_presentCount() }}: {{ presentCount() }} / {{ attendees.length }}</ion-note>
            </ion-item>
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class AttendeeList {
  // inputs
  public attendees = model.required<MeetingAttendee[]>();
  public readonly i18n = input.required<MeetingI18n>();
  public readonly readOnly = input(false);
  /** okey of the meeting the proxies belong to */
  public readonly meetingKey = input('');
  /** the proxies recorded for this meeting, in all states; only the active ones are shown */
  public readonly proxies = input<MandateModel[]>([]);
  /** personKeys of the rows that offer «Vollmacht erfassen» */
  public readonly recordProxyFor = input<string[]>([]);

  // outputs
  /** the grantor's personKey */
  public readonly recordProxy = output<string>();

  /** StoreDate of today: a proxy is shown while it is active */
  private readonly today = getTodayStr(DateFormat.StoreDate);

  protected readonly isReadOnly = computed(() => this.readOnly() === true);
  protected readonly presentCount = computed(() => countPresent(this.attendees()));

  /** «vertreten durch {Name}» for a grantor with an active proxy, else '' */
  protected representedBy(personKey: string): string {
    const proxy = proxyFor(this.proxies(), this.meetingKey(), personKey, this.today);
    if (!proxy) return '';
    const name = proxyHolderName(proxy, this.attendees());
    return name ? fill(this.i18n().proxy_representedBy(), { name }) : '';
  }

  /** «+n Vollmacht» for a holder of active proxies, else '' */
  protected holdsProxies(personKey: string): string {
    const count = proxiesHeldBy(this.proxies(), this.meetingKey(), personKey, this.today).length;
    return count > 0 ? fill(this.i18n().proxy_holds(), { count }) : '';
  }

  protected canRecord(personKey: string): boolean {
    return this.recordProxyFor().includes(personKey);
  }

  protected setState(personKey: string, state: AttendeeState): void {
    this.attendees.update(attendees =>
      attendees.map(a => a.person.key === personKey ? { ...a, state } : a));
  }
}
