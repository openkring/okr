import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote, IonSelect, IonSelectOption } from '@ionic/angular';
import { TRANSPORT_MODES, type TransportMode } from '@okr/shared-models';
import { figureTexts, formatDuration, formatKm, type TrackerI18n } from '@okr/mobility-tracker-util';
import { SvgIconPipe } from '@okr/shared-pipes';

export interface TrackSectionRow {
  mode: TransportMode; distanceM: number; durationS: number; detected: boolean;
  steps?: number; splitAvgS?: number; splitBestS?: number; // activity figures (spec 1.122)
  strokes?: number; strokeRateAvg?: number; strokeRateMax?: number; distancePerStrokeM?: number; // row (spec 1.122 2c)
  line?: string; // train/bus/ship: the line from the timetable, e.g. «R45» (spec 1.129 §4.2)
}
export interface TrackModeChange { index: number; mode: TransportMode }

/** The sections of a track: mode (changeable), distance, duration, split and merge-with-next per row; `readonly` shows them only. */
@Component({
  selector: 'okr-track-sections',
  imports: [IonList, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonButton, IonIcon, SvgIconPipe],
  template: `
    <ion-list>
      @for (section of sections(); track $index; let i = $index; let last = $last) {
        <ion-item>
          <ion-label>
            @if (readonly()) {
              <h3>{{ modeLabel(section.mode) }}</h3>
            } @else {
              <ion-select interface="popover" [label]="i18n().section_change_mode()" label-placement="stacked"
                [value]="section.mode" (ionChange)="onMode(i, $event.detail.value)">
                @for (m of modes; track m) {
                  <ion-select-option [value]="m">{{ modeLabel(m) }}</ion-select-option>
                }
              </ion-select>
            }
            <p>{{ line(section) }}</p>
            @if (section.detected) {
              <ion-note>{{ i18n().section_detected() }}</ion-note>
            }
          </ion-label>
          @if (!readonly() && (pointCounts()[i] ?? 0) >= 3) {
            <ion-button slot="end" fill="clear" size="small" (click)="split.emit({ index: i })">
              <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />{{ i18n().section_split() }}
            </ion-button>
          }
          @if (!readonly() && !last) {
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
  /** true = a plain list (mode as text, no split / merge): the diary's read-only track view */
  public readonly readonly = input(false);

  public readonly modeChanged = output<TrackModeChange>();
  public readonly split = output<{ index: number }>();
  public readonly merge = output<{ index: number }>();

  protected readonly modes = TRANSPORT_MODES;

  protected modeLabel(mode: TransportMode): string {
    return this.i18n()[`mode_${mode}`]();
  }

  /** the timetable line (if any) · distance · duration, then the section's activity figures (steps, splits) when it has any */
  protected line(section: TrackSectionRow): string {
    const i18n = this.i18n();
    const figures = figureTexts(section, {
      steps: i18n.figure_steps(), splitAvg: i18n.figure_split_avg(), splitBest: i18n.figure_split_best(),
      strokes: i18n.figure_strokes(), rateAvg: i18n.figure_rate_avg(), rateMax: i18n.figure_rate_max(), perStroke: i18n.figure_per_stroke(),
    });
    return [...(section.line ? [section.line] : []), formatKm(section.distanceM), formatDuration(section.durationS), ...figures].join(' · ');
  }

  protected onMode(index: number, mode: TransportMode): void {
    if (mode !== this.sections()[index]?.mode) this.modeChanged.emit({ index, mode });
  }
}
