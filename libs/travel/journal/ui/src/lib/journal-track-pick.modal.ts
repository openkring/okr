import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

/** One track the author may choose: its journal track key, the name and a line «14.01.2027 · Zu Fuss · Zug · 12,3 km». */
export interface PickableTrack { key: string; name: string; facts: string; inJournal: boolean; current: boolean }

export interface JournalTrackPickI18n { title: string; empty: string; inJournal: string; offline: string }

/**
 * «Strecke wählen» (spec 1.154 phase 5, decision 7): the author's tracks as the journal passes them — online the tracker
 * trips with the footprint's day on top, offline the tracks the journal already holds (`i18n.offline` says so, '' when
 * online). The journal's tracks are marked, the one chosen now is highlighted. A tap dismisses with the track key and
 * role 'confirm'. Presentational: the journal builds the list and attaches the chosen trip.
 */
@Component({
  selector: 'okr-journal-track-pick-modal',
  standalone: true,
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonNote],
  styles: [`
    .note, .empty { margin: 8px 16px; color: var(--ion-color-medium); font-size: 0.9rem; }
    ion-item.current { --background: var(--ion-color-light); }
    .badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 8px; background: var(--ion-color-light); white-space: nowrap; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    <ion-content>
      @if (i18n().offline) {
        <p class="note">{{ i18n().offline }}</p>
      }
      @if (tracks().length === 0) {
        <p class="empty">{{ i18n().empty }}</p>
      } @else {
        <ion-list lines="full">
          @for (track of tracks(); track track.key) {
            <ion-item button [detail]="false" [class.current]="track.current" (click)="choose(track.key)">
              <ion-label>
                <h3>{{ track.name }}</h3>
                <p>{{ track.facts }}</p>
              </ion-label>
              @if (track.inJournal) {
                <ion-note slot="end" class="badge">{{ i18n().inJournal }}</ion-note>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class JournalTrackPickModal {
  private readonly modalController = inject(ModalController);

  public readonly tracks = input.required<PickableTrack[]>();
  public readonly i18n = input.required<JournalTrackPickI18n>();

  protected choose(key: string): Promise<boolean> {
    return dismissOverlay(this.modalController, key, 'confirm');
  }
}
