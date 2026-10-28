import { Component, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle } from '@ionic/angular';

import { DiaryI18n, DiaryTrackCard, diaryTrackModeLabel } from '@okr/content-diary-util';
import { figureTexts, formatDuration, formatKm } from '@okr/mobility-tracker-util';
import { TrackMap, TrackMapSection } from '@okr/mobility-tracker-ui';

/**
 * One recorded track of a diary day (spec 1.121 §7): a small map without photo pins (detail-boosted: finer
 * map detail over the same area), the transport modes in
 * order («zu Fuss · Zug»), distance and duration. The whole card is one button; `open` asks for the track view.
 */
@Component({
  selector: 'okr-diary-track-card',
  standalone: true,
  imports: [TrackMap, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent],
  styles: [`
    :host { display: block; }
    ion-card { margin: 8px; cursor: pointer; }
    ion-card-title { font-size: 1.05rem; font-weight: 600; }
    okr-track-map { --okr-track-map-height: 180px; pointer-events: none; }
  `],
  template: `
    <ion-card button (click)="open.emit(card())">
      <okr-track-map [sections]="sections()" [live]="false" [detailBoost]="true" />
      <ion-card-header>
        <ion-card-subtitle>{{ card().startTime }} · {{ modes() }}</ion-card-subtitle>
        <ion-card-title>{{ card().name }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>{{ line() }}</ion-card-content>
    </ion-card>
  `,
})
export class DiaryTrackCardView {
  public readonly card = input.required<DiaryTrackCard>();
  public readonly i18n = input.required<DiaryI18n>();

  public readonly open = output<DiaryTrackCard>();

  protected readonly sections = computed<TrackMapSection[]>(() => this.card().sections);
  protected readonly modes = computed(() => this.card().modes.map(m => diaryTrackModeLabel(this.i18n(), m)).join(' · '));
  /** distance · duration, then the track's steps and row split when it has any (spec 1.122) */
  protected readonly line = computed(() => {
    const card = this.card();
    const i18n = this.i18n();
    const figures = figureTexts(card, {
      steps: i18n.track_steps(), splitAvg: i18n.track_split_avg(), splitBest: '', strokes: i18n.track_strokes(), rateAvg: i18n.track_rate_avg(),
    });
    return [formatKm(card.distanceM), formatDuration(card.durationS), ...figures].join(' · ');
  });
}
