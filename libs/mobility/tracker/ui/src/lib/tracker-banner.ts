import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon, IonSelect, IonSelectOption } from '@ionic/angular';
import { TRANSPORT_MODES, type TransportMode } from '@okr/shared-models';
import { formatDuration, formatKm, type TrackerI18n } from '@okr/mobility-tracker-util';
import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * The recording banner: mode (a select — a correction by hand while recording), distance, duration,
 * pause/resume/stop and an optional mode-change proposal.
 */
@Component({
  selector: 'okr-tracker-banner',
  imports: [IonButton, IonIcon, IonSelect, IonSelectOption, SvgIconPipe],
  styles: [`
    :host { display: block; padding: 8px 12px; background: var(--ion-color-light); color: var(--ion-color-dark); }
    .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .stats { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
    .mode { font-weight: 600; --padding-start: 0; --padding-top: 0; --padding-bottom: 0; min-height: 0; }
    .numbers { font-variant-numeric: tabular-nums; }
    .proposal { margin-top: 4px; border-top: 1px solid var(--ion-color-medium-tint); padding-top: 4px; }
  `],
  template: `
    <div class="row">
      <div class="stats">
        <ion-select class="mode" interface="popover" [value]="mode()" [attr.aria-label]="i18n().start_mode()"
          (ionChange)="onModeChange($event.detail.value)">
          @for (m of modes; track m) {
            <ion-select-option [value]="m">{{ modeLabel(m) }}</ion-select-option>
          }
        </ion-select>
        <span class="numbers" aria-live="off">{{ distanceText() }} · {{ durationText() }}</span>
      </div>
      @if (state() === 'recording') {
        <ion-button fill="outline" (click)="pause.emit()">{{ i18n().recording_pause() }}</ion-button>
      } @else {
        <ion-button fill="outline" (click)="resume.emit()">
          <ion-icon slot="start" src="{{ 'play' | svgIcon }}" />{{ i18n().recording_resume() }}
        </ion-button>
      }
      <ion-button color="danger" (click)="stop.emit()">
        <ion-icon slot="start" src="{{ 'stop' | svgIcon }}" />{{ i18n().recording_stop() }}
      </ion-button>
    </div>
    @if (proposal(); as proposed) {
      <div class="proposal row" role="status">
        <span class="stats">{{ proposalText() }}</span>
        <ion-button size="small" (click)="acceptProposal.emit(proposed)">
          <ion-icon slot="start" src="{{ 'checkmark' | svgIcon }}" />{{ i18n().proposal_accept() }}
        </ion-button>
        <ion-button size="small" fill="clear" (click)="dismissProposal.emit()">{{ i18n().proposal_dismiss() }}</ion-button>
      </div>
    }
  `,
})
export class TrackerBanner {
  public readonly mode = input.required<TransportMode>();
  public readonly distanceM = input.required<number>();
  public readonly durationS = input.required<number>();
  public readonly state = input.required<'recording' | 'paused'>();
  public readonly proposal = input<TransportMode | undefined>(undefined);
  public readonly i18n = input.required<TrackerI18n>();

  public readonly pause = output<void>();
  public readonly resume = output<void>();
  public readonly stop = output<void>();
  /** Emits the proposed mode. */
  public readonly acceptProposal = output<TransportMode>();
  public readonly dismissProposal = output<void>();
  /** A mode chosen by hand in the select (only when it differs from the current one). */
  public readonly modeChange = output<TransportMode>();

  protected readonly modes = TRANSPORT_MODES;

  protected readonly distanceText = computed(() => formatKm(this.distanceM()));
  protected readonly durationText = computed(() => formatDuration(this.durationS()));
  protected readonly proposalText = computed(() => {
    const proposed = this.proposal();
    if (!proposed) return '';
    return this.i18n().proposal_text().replace('{mode}', this.i18n()[`mode_${proposed}`]());
  });

  protected modeLabel(mode: TransportMode): string {
    return this.i18n()[`mode_${mode}`]();
  }

  protected onModeChange(value: TransportMode | undefined): void {
    if (value && value !== this.mode()) this.modeChange.emit(value);
  }
}
