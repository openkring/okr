import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSelect, IonSelectOption } from '@ionic/angular';
import { TRANSPORT_MODES, type TransportMode } from '@okr/shared-models';
import { formatDuration, formatKm, type TrackerI18n } from '@okr/mobility-tracker-util';
import { SvgIconPipe } from '@okr/shared-pipes';

export interface TrackSectionRow { mode: TransportMode; distanceM: number; durationS: number; detected: boolean }
export interface TrackModeChange { index: number; mode: TransportMode }

/** The sections of a track: mode (changeable), distance, duration, split and merge-with-next per row. */
@Component({
  selector: 'okr-track-sections',
  imports: [IonList, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonButton, IonIcon, SvgIconPipe],
  template: `
    <ion-list>
      @for (section of sections(); track $index; let i = $index; let last = $last) {
        <ion-item>
          <ion-label>
            <ion-select interface="popover" [label]="i18n().section_change_mode()" label-placement="stacked"
              [value]="section.mode" (ionChange)="onMode(i, $event.detail.value)">
              @for (m of modes; track m) {
                <ion-select-option [value]="m">{{ modeLabel(m) }}</ion-select-option>
              }
            </ion-select>
            <p>{{ km(section.distanceM) }} · {{ duration(section.durationS) }}</p>
            @if (section.detected) {
              <ion-note>{{ i18n().section_detected() }}</ion-note>
            }
          </ion-label>
          @if ((pointCounts()[i] ?? 0) >= 3) {
            <ion-button slot="end" fill="clear" size="small" (click)="split.emit({ index: i })">
              <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />{{ i18n().section_split() }}
            </ion-button>
          }
          @if (!last) {
            <ion-button slot="end" fill="clear" size="small" (click)="merge.emit({ index: i })">
              <ion-icon slot="start" src="{{ 'link' | svgIcon }}" />{{ i18n().section_merge() }}
            </ion-button>
          }
        </ion-item>
      }
    </ion-list>
  `,
})
export class TrackSections {
  public readonly sections = input<TrackSectionRow[]>([]);
  /** Number of points per section (same order); a section with fewer than 3 points cannot be split. */
  public readonly pointCounts = input<number[]>([]);
  public readonly i18n = input.required<TrackerI18n>();

  public readonly modeChanged = output<TrackModeChange>();
  public readonly split = output<{ index: number }>();
  public readonly merge = output<{ index: number }>();

  protected readonly modes = TRANSPORT_MODES;

  protected modeLabel(mode: TransportMode): string {
    return this.i18n()[`mode_${mode}`]();
  }

  protected km(meters: number): string {
    return formatKm(meters);
  }

  protected duration(seconds: number): string {
    return formatDuration(seconds);
  }

  protected onMode(index: number, mode: TransportMode): void {
    if (mode !== this.sections()[index]?.mode) this.modeChanged.emit({ index, mode });
  }
}
