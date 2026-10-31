import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon, IonLabel, IonNote } from '@ionic/angular';
import type { TrackerI18n } from '@okr/mobility-tracker-util';
import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * The selected track point under the map (spec 1.129 §5.2): what it is («15:47 · 4,3 km · zu Fuss»), ◀ ▶ to step
 * one point, and the corrections that apply to it. The page decides which actions are offered and does them.
 */
@Component({
  selector: 'okr-track-point-bar',
  imports: [IonButton, IonIcon, IonLabel, IonNote, SvgIconPipe],
  styles: [`
    :host { display: block; padding: 4px 8px 8px; border-bottom: 1px solid var(--ion-color-light-shade, #ddd); }
    .row { display: flex; align-items: center; gap: 4px; }
    ion-label { flex: 1; text-align: center; font-variant-numeric: tabular-nums; }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; }
    ion-note { display: block; text-align: center; font-size: 0.85rem; padding: 0 8px 4px; }
  `],
  template: `
    @if (hint()) {
      <ion-note>{{ hint() }}</ion-note>
    }
    <div class="row">
      <ion-button fill="clear" size="small" [disabled]="!canPrev()" (click)="step.emit(-1)" [attr.aria-label]="i18n().point_prev()">
        <ion-icon slot="icon-only" src="{{ 'chevron-back' | svgIcon }}" />
      </ion-button>
      <ion-label>{{ label() }}</ion-label>
      <ion-button fill="clear" size="small" [disabled]="!canNext()" (click)="step.emit(1)" [attr.aria-label]="i18n().point_next()">
        <ion-icon slot="icon-only" src="{{ 'chevron-forward' | svgIcon }}" />
      </ion-button>
      <ion-button fill="clear" size="small" color="medium" (click)="closed.emit()" [attr.aria-label]="i18n().point_close()">
        <ion-icon slot="icon-only" src="{{ 'close' | svgIcon }}" />
      </ion-button>
    </div>
    <div class="actions">
      @if (canSplit()) {
        <ion-button fill="clear" size="small" [disabled]="disabled()" (click)="splitHere.emit()">
          <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />{{ i18n().point_split() }}
        </ion-button>
      }
      @if (canRemove()) {
        <ion-button fill="clear" size="small" color="danger" [disabled]="disabled()" (click)="removePoint.emit()">
          <ion-icon slot="start" src="{{ 'trash' | svgIcon }}" />{{ i18n().point_remove() }}
        </ion-button>
      }
      @if (hasSpike()) {
        <ion-button fill="clear" size="small" color="danger" [disabled]="disabled()" (click)="removeSpike.emit()">
          <ion-icon slot="start" src="{{ 'remove-circle' | svgIcon }}" />{{ i18n().point_remove_spike() }}
        </ion-button>
      }
    </div>
  `,
})
export class TrackPointBar {
  public readonly i18n = input.required<TrackerI18n>();
  /** time · distance from the start · mode of the selected point */
  public readonly label = input('');
  /** a line above, e.g. «Wähle auf der Karte, wo der neue Abschnitt beginnt»; '' = none */
  public readonly hint = input('');
  public readonly canPrev = input(true);
  public readonly canNext = input(true);
  public readonly canSplit = input(false);
  public readonly canRemove = input(false);
  public readonly hasSpike = input(false);
  /** the actions wait (a correction is being saved) */
  public readonly disabled = input(false);

  /** -1 = the point before, +1 = the point after */
  public readonly step = output<number>();
  public readonly splitHere = output<void>();
  public readonly removePoint = output<void>();
  public readonly removeSpike = output<void>();
  public readonly closed = output<void>();
}
