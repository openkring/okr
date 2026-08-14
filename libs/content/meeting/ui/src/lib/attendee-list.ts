import { Component, computed, input, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonList, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';

import { AttendeeState, MeetingAttendee } from '@okr/shared-models';

import { MeetingI18n, countPresent } from '@okr/content-meeting-util';

/** Attendance record of one meeting — one segment per person, four states. */
@Component({
  selector: 'okr-attendee-list',
  standalone: true,
  imports: [
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonNote, IonSegment, IonSegmentButton,
  ],
  styles: [`ion-segment { max-width: 340px; } ion-segment-button { min-width: 70px; }`],
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
                  <ion-label>{{ attendee.person.name1 }} {{ attendee.person.name2 }}</ion-label>
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

  protected readonly isReadOnly = computed(() => this.readOnly() === true);
  protected readonly presentCount = computed(() => countPresent(this.attendees()));

  protected setState(personKey: string, state: AttendeeState): void {
    this.attendees.update(attendees =>
      attendees.map(a => a.person.key === personKey ? { ...a, state } : a));
  }
}
