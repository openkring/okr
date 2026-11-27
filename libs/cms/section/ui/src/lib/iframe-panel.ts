import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { IonCard, IonCardContent, IonIcon, IonNote } from '@ionic/angular';

import { URL_LENGTH } from '@okr/shared-constants';
import { IFRAME_HEIGHTS, IframeConfig, IframeHeight } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, fill } from '@okr/shared-util-core';
import { cleanIframeConfig, getFieldErrors, iframeHeightOf, parseIframeSource, SectionErrors, SectionI18n } from '@okr/cms-section-util';

const HEIGHT_LABELS: Record<IframeHeight, 'iframe_height_s' | 'iframe_height_m' | 'iframe_height_l' | 'iframe_height_full'> = {
  S: 'iframe_height_s', M: 'iframe_height_m', L: 'iframe_height_l', full: 'iframe_height_full',
};
/** the height of the little frame in a choice, in px */
const HEIGHT_PREVIEW: Record<IframeHeight, number> = { S: 12, M: 18, L: 26, full: 34 };

/**
 * The settings of an embedded page: one field for the link or the embed code as the editor copied it (`parseIframeSource` takes the
 * `src` out of an `<iframe …>`), and its height. Shown in the iframe editor's panel while the page is selected, and read-only in the
 * section form. Every change sets `config` once, without the free CSS of a section stored before 2026-11-27.
 */
@Component({
  selector: 'okr-iframe-panel',
  standalone: true,
  imports: [SvgIconPipe, ErrorNote, TextInput, IonCard, IonCardContent, IonIcon, IonNote],
  styles: [`
    .field-label { display: block; margin: 0 0 6px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .found { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; font-size: 0.85rem; }
    .found.allowed { color: var(--ion-color-success-shade); }
    .found.blocked { color: var(--ion-color-warning-shade); }
    .found ion-icon { flex: none; font-size: 18px; }
    .note { display: block; margin-top: 8px; font-size: 0.85rem; }
    .heights { display: flex; flex-wrap: wrap; gap: 6px; }
    .height { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; width: 72px; height: 70px; padding: 6px 4px;
      font: inherit; font-size: 0.75rem; color: var(--ion-text-color); background: transparent; border: 1px solid var(--ion-color-light-shade); border-radius: 8px; cursor: pointer; }
    .height:disabled { cursor: default; opacity: 0.6; }
    .height.current { border: 2px solid var(--ion-color-primary); padding: 5px 3px; }
    .height .frame { width: 44px; background: var(--ion-color-primary); border-radius: 2px; }
  `],
  template: `
    @let t = i18n();
    <ion-card>
      <ion-card-content>
        <okr-text-input [i18n]="linkI18n()" [value]="linkText()" (valueChange)="onLinkChange($event)" [maxLength]="maxLength" [readOnly]="isReadOnly()" [showHelper]="true" />
        @if (linkInvalid()) {
          <okr-error-note [errors]="[t.iframe_link_error()]" />
        } @else if (typed(); as found) {
          @if (found.allowed) {
            <p class="found allowed"><ion-icon src="{{ 'checkmark' | svgIcon }}" aria-hidden="true" />{{ foundText(t.iframe_found_allowed(), found.host) }}</p>
          } @else {
            <p class="found blocked"><ion-icon src="{{ 'warning' | svgIcon }}" aria-hidden="true" />{{ foundText(t.iframe_found_blocked(), found.host) }}</p>
          }
        }
        @if (!linkInvalid()) {
          <okr-error-note [errors]="errorsFor('url')" />
        }
      </ion-card-content>
    </ion-card>
    <ion-card>
      <ion-card-content>
        <span class="field-label" id="iframe-height-label">{{ t.iframe_height_title() }}</span>
        <div class="heights" role="radiogroup" aria-labelledby="iframe-height-label">
          @for (choice of heights; track choice) {
            <button type="button" class="height" role="radio" [class.current]="choice === height()" [attr.aria-checked]="choice === height()"
              [disabled]="isReadOnly()" (click)="setHeight(choice)">
              <span class="frame" [style.height.px]="preview[choice]"></span>
              {{ heightLabel(choice) }}
            </button>
          }
        </div>
        <ion-note class="note">{{ t.iframe_height_helper() }}</ion-note>
        <okr-error-note [errors]="errorsFor('height')" />
      </ion-card-content>
    </ion-card>
  `,
})
export class IframePanel {
  // inputs
  public readonly config = input.required<IframeConfig>();
  public readonly readOnly = input(true);
  /** vest field name -> messages of the running section suite */
  public readonly errors = input<SectionErrors>({});
  public readonly i18n = input.required<SectionI18n>();

  // outputs
  public readonly configChange = output<IframeConfig>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly heights = IFRAME_HEIGHTS;
  protected readonly preview = HEIGHT_PREVIEW;
  protected readonly maxLength = URL_LENGTH;

  protected readonly height = computed(() => iframeHeightOf(this.config()));
  /** the text in the field: what the editor typed (an embed code stays as pasted), else the stored url */
  protected readonly linkText = signal('');
  protected readonly typed = computed(() => parseIframeSource(this.linkText()));
  protected readonly linkInvalid = computed(() => this.linkText().trim() !== '' && this.typed() === undefined);

  protected readonly linkI18n = computed(() => ({
    name: 'iframeLink',
    label: this.i18n().iframe_link_label(),
    placeholder: this.i18n().iframe_link_placeholder(),
    helper: this.i18n().iframe_link_helper(),
  } as TextInputI18n));

  constructor() {
    // a stored url other than the typed one (another section, undo, «Abbrechen») shows as itself
    effect(() => {
      const stored = this.config().url ?? '';
      untracked(() => {
        if (stored !== (this.typed()?.url ?? '')) this.linkText.set(stored);
      });
    });
  }

  /************************************** actions *********************************************** */
  protected onLinkChange(value: string): void {
    this.linkText.set(value ?? '');
    // a text that is no page clears the stored url, so the suite reports it and the section cannot be saved so
    const url = this.typed()?.url ?? '';
    const current = cleanIframeConfig(this.config());
    if (url !== current.url || this.config().style !== undefined) this.configChange.emit({ ...current, url });
  }

  protected setHeight(height: IframeHeight): void {
    if (height !== this.height() || this.config().height === undefined) this.configChange.emit({ ...cleanIframeConfig(this.config()), height });
  }

  protected heightLabel(height: IframeHeight): string {
    return this.i18n()[HEIGHT_LABELS[height]]();
  }

  protected foundText(template: string, host: string): string {
    return fill(template, { host });
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
