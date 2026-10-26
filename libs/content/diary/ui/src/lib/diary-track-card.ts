import { Component, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle } from '@ionic/angular';

import { DiaryTrackCard } from '@okr/content-diary-util';
import { formatDuration, formatKm, TrackerI18n } from '@okr/mobility-tracker-util';
import { TrackMap, TrackMapSection } from '@okr/mobility-tracker-ui';

/**
 * One recorded track of a diary day (spec 1.121 §7): a small map without photo pins, the transport modes in
 * order («zu Fuss · Zug»), distance and duration. The whole card is one button; `open` asks for the track view.
 */
@Component({
  selector: 'okr-diary-track-card',
  standalone: true,
  imports: [TrackMap, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent],
  styles: [`
    :host { display: block; }
    ion-card { max-width: 480px; cursor: pointer; }
    okr-track-map { --okr-track-map-height: 180px; pointer-events: none; }
  `],
  template: `
    <ion-card button (click)="open.emit(card())">
      <okr-track-map [sections]="sections()" [live]="false" />
      <ion-card-header>
        <ion-card-subtitle>{{ card().startTime }} · {{ modes() }}</ion-card-subtitle>
        <ion-card-title>{{ card().name }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>{{ km() }} · {{ duration() }}</ion-card-content>
    </ion-card>
  `,
})
export class DiaryTrackCardView {
  public readonly card = input.required<DiaryTrackCard>();
  public readonly i18n = input.required<TrackerI18n>();

  public readonly open = output<DiaryTrackCard>();

  protected readonly sections = computed<TrackMapSection[]>(() => this.card().sections);
  protected readonly modes = computed(() => this.card().modes.map(m => this.i18n()[`mode_${m}`]()).join(' · '));
  protected readonly km = computed(() => formatKm(this.card().distanceM));
  protected readonly duration = computed(() => formatDuration(this.card().durationS));
}
