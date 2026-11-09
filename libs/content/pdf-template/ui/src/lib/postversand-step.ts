// libs/content/pdf-template/ui/src/lib/postversand-step.ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonItem, IonLabel, IonNote, IonRadio, IonRadioGroup, IonSegment, IonSegmentButton } from '@ionic/angular';

import { PostOptions } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, Spinner } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { EmailComposerI18n, formatChf, postCostLines } from '@okr/content-pdf-template-util';
import type { PostQuote } from '@okr/content-pdf-template-data-access';

/** «Per Pingen senden» (paid from the tenant's credit) or «PDF herunterladen» (free, the sender posts them). */
export type PostMode = 'pingen' | 'download';

/**
 * The Post step of a Versand (spec 1.150 §6.2): how the letters go out, how they are printed, what they
 * cost, and the sender's consent to the amount. Dumb: the composer owns the quote and the state.
 */
@Component({
  selector: 'okr-postversand-step',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonCard, IonCardContent, IonRadioGroup, IonRadio, IonItem, IonLabel, IonNote, IonSegment, IonSegmentButton, IonButton, Spinner, Checkbox],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .heading { display: block; padding: 8px 16px 0; font-weight: 600; }
    .option { display: block; padding: 8px 16px 0; }
    .option-label { display: block; font-size: 0.85rem; color: var(--ion-color-medium-shade); margin-bottom: 4px; }
    .note { display: block; padding: 8px 16px 0; }
    .cost { margin: 12px 16px 0; padding: 12px; border: 1px solid var(--ion-border-color, #d0d7de); border-radius: 8px; }
    .cost-row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
    .cost-row.total { margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--ion-border-color, #d0d7de); font-weight: 600; }
    .cost-row.low { color: var(--ion-color-danger); font-weight: 600; }
    .topup { margin: 8px 16px 0; }
  `],
  template: `
    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-radio-group [value]="mode()" (ionChange)="onModeChange($event.detail.value)">
          <ion-item lines="none">
            <ion-radio value="pingen" labelPlacement="end" justify="start" [disabled]="!pingenAvailable()">
              <ion-label class="ion-text-wrap">
                {{ i18n().post_mode_pingen() }}
                <ion-note class="option-label">{{ i18n().post_mode_pingen_hint() }}</ion-note>
              </ion-label>
            </ion-radio>
          </ion-item>
          <ion-item lines="none">
            <ion-radio value="download" labelPlacement="end" justify="start">
              <ion-label class="ion-text-wrap">
                {{ i18n().post_mode_download() }}
                <ion-note class="option-label">{{ i18n().post_mode_download_hint() }}</ion-note>
              </ion-label>
            </ion-radio>
          </ion-item>
        </ion-radio-group>

        @if (!pingenAvailable()) {
          <ion-note color="warning" class="note">{{ i18n().post_unavailable() }}</ion-note>
        }

        @if (mode() === 'pingen') {
          <div class="option">
            <span class="option-label">{{ i18n().post_delivery_label() }}</span>
            <ion-segment [value]="options().deliveryProduct" (ionChange)="onDeliveryChange($event.detail.value)">
              <ion-segment-button value="fast"><ion-label>{{ i18n().post_delivery_fast() }}</ion-label></ion-segment-button>
              <ion-segment-button value="cheap"><ion-label>{{ i18n().post_delivery_cheap() }}</ion-label></ion-segment-button>
            </ion-segment>
          </div>
          <div class="option">
            <span class="option-label">{{ i18n().post_spectrum_label() }}</span>
            <ion-segment [value]="options().printSpectrum" (ionChange)="onSpectrumChange($event.detail.value)">
              <ion-segment-button value="color"><ion-label>{{ i18n().post_spectrum_color() }}</ion-label></ion-segment-button>
              <ion-segment-button value="grayscale"><ion-label>{{ i18n().post_spectrum_grayscale() }}</ion-label></ion-segment-button>
            </ion-segment>
          </div>
          <div class="option">
            <span class="option-label">{{ i18n().post_print_mode_label() }}</span>
            <ion-segment [value]="options().printMode" (ionChange)="onPrintModeChange($event.detail.value)">
              <ion-segment-button value="simplex"><ion-label>{{ i18n().post_print_mode_simplex() }}</ion-label></ion-segment-button>
              <ion-segment-button value="duplex"><ion-label>{{ i18n().post_print_mode_duplex() }}</ion-label></ion-segment-button>
            </ion-segment>
          </div>

          @if (loading()) {
            <div class="note"><okr-spinner /><ion-note>{{ i18n().post_loading() }}</ion-note></div>
          } @else if (error(); as message) {
            <ion-note color="warning" class="note">{{ message }}</ion-note>
          } @else if (quote(); as q) {
            @if (q.letters === 0) {
              <ion-note color="warning" class="note">{{ i18n().post_none() }}</ion-note>
            } @else {
              <div class="cost">
                <div class="cost-row"><span>{{ lettersLine() }}</span><span>{{ lines().letterTotal }}</span></div>
                <div class="cost-row"><span>{{ pagesLine() }}</span><span>{{ lines().pageTotal }}</span></div>
                <div class="cost-row total"><span>{{ i18n().post_cost_total() }}</span><span>{{ totalText() }}</span></div>
                <div class="cost-row" [class.low]="!q.sufficient"><span>{{ i18n().post_cost_balance() }}</span><span>{{ balanceText() }}</span></div>
              </div>
            }
            @if (q.abroad > 0) {
              <ion-note class="note">{{ abroadText() }}</ion-note>
            }
            @if (q.missing > 0) {
              <ion-note class="note">{{ missingText() }}</ion-note>
            }
            @if (q.letters > 0) {
              @if (q.sufficient) {
                <okr-checkbox [i18n]="consentI18n()" [checked]="accepted()" (checkedChange)="acceptedChange.emit($event)" [readOnly]="false" />
              } @else {
                <ion-note color="danger" class="note">{{ i18n().post_insufficient() }}</ion-note>
                @if (canTopUp()) {
                  <ion-button class="topup" fill="outline" size="small" (click)="topUp.emit()">{{ i18n().post_topup() }}</ion-button>
                } @else {
                  <ion-note class="note">{{ i18n().post_topup_admin() }}</ion-note>
                }
              }
            }
          }
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class PostversandStep {
  public readonly i18n = input.required<EmailComposerI18n>();
  public readonly quote = input<PostQuote | undefined>(undefined);
  public readonly loading = input<boolean>(false);
  /** A resolved message when the price could not be fetched; empty/undefined otherwise. */
  public readonly error = input<string | undefined>(undefined);
  public readonly options = input.required<PostOptions>();
  public readonly mode = input<PostMode>('download');
  public readonly accepted = input<boolean>(false);
  /** Only an administrator can open the top-up screen. */
  public readonly canTopUp = input<boolean>(false);
  /** The tenant's credit is configured on the server; false offers the download only. */
  public readonly pingenAvailable = input<boolean>(true);

  public readonly optionsChange = output<PostOptions>();
  public readonly modeChange = output<PostMode>();
  public readonly acceptedChange = output<boolean>();
  public readonly topUp = output<void>();

  /** The rates come from the pricing table, the sums from the quote's counts. */
  protected readonly lines = computed(() => {
    const q = this.quote();
    return postCostLines(q?.letters ?? 0, q?.pages ?? 0);
  });
  protected readonly lettersLine = computed(() =>
    fill(this.i18n().post_cost_letters(), { count: this.quote()?.letters ?? 0, price: this.lines().letterPrice }));
  protected readonly pagesLine = computed(() =>
    fill(this.i18n().post_cost_pages(), { count: this.quote()?.pages ?? 0, price: this.lines().pagePrice }));
  protected readonly totalText = computed(() => formatChf(this.quote()?.total ?? 0));
  protected readonly balanceText = computed(() => formatChf(this.quote()?.balance ?? 0));
  protected readonly abroadText = computed(() => fill(this.i18n().post_abroad(), { count: this.quote()?.abroad ?? 0 }));
  protected readonly missingText = computed(() => fill(this.i18n().post_missing(), { count: this.quote()?.missing ?? 0 }));
  protected readonly consentI18n = computed(() => ({
    name: 'postAccepted', label: this.i18n().post_consent(), helper: '',
  } as CheckboxI18n));

  protected onModeChange(value: unknown): void {
    if ((value === 'pingen' || value === 'download') && value !== this.mode()) this.modeChange.emit(value);
  }

  protected onDeliveryChange(value: unknown): void {
    if ((value === 'fast' || value === 'cheap') && value !== this.options().deliveryProduct) {
      this.optionsChange.emit({ ...this.options(), deliveryProduct: value });
    }
  }

  protected onSpectrumChange(value: unknown): void {
    if ((value === 'color' || value === 'grayscale') && value !== this.options().printSpectrum) {
      this.optionsChange.emit({ ...this.options(), printSpectrum: value });
    }
  }

  protected onPrintModeChange(value: unknown): void {
    if ((value === 'simplex' || value === 'duplex') && value !== this.options().printMode) {
      this.optionsChange.emit({ ...this.options(), printMode: value });
    }
  }
}
