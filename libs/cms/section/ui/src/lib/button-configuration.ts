import { Component, computed, input, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular';

import { BUTTON_STYLE_SHAPE, ButtonAction, ButtonActionConfig, ButtonStyle, ICON_CONFIG_SHAPE, IconConfig } from '@okr/shared-models';
import { BUTTON_SEGMENT_FIELDS, getErrorSegments, SectionErrors, SectionI18n } from '@okr/cms-section-util';

import { ButtonActionConfiguration, ContractOption } from './button-action-configuration';
import { ButtonStyleConfiguration } from './button-style-configuration';
import { IconConfiguration } from './icon-configuration';

type Segment = 'button' | 'icon' | 'action';
const SEGMENTS: readonly Segment[] = ['button', 'icon', 'action'];

/**
 * The button card of a button section: one card with three segments, always shown (no advanced toggle).
 * - **Button**: label, shape, fill, width, height and colour.
 * - **Icon**: the icon (from the icon selector), its size and slot.
 * - **Aktion**: what a click does, its url or contract and the optional alt text.
 */
@Component({
  selector: 'okr-button-config',
  standalone: true,
  imports: [
    ButtonStyleConfiguration, IconConfiguration, ButtonActionConfiguration,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonSegment, IonSegmentButton, IonLabel
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .error-dot { display: inline-block; width: 8px; height: 8px; margin-inline-start: 6px; border-radius: 50%; background: var(--ion-color-danger); vertical-align: middle; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().button_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().button_style_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event.detail.value)">
          <ion-segment-button value="button">
            <ion-label>{{ i18n().button_segment_button() }}@if (hasErrors('button')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="icon">
            <ion-label>{{ i18n().button_segment_icon() }}@if (hasErrors('icon')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="action">
            <ion-label>{{ i18n().button_segment_action() }}@if (hasErrors('action')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
        </ion-segment>

        @switch (segment()) {
          @case ('button') {
            <okr-button-style
              [formData]="style()" (formDataChange)="styleChange.emit($event)"
              [readOnly]="readOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
          @case ('icon') {
            <okr-icon-config
              [formData]="icon()" (formDataChange)="iconChange.emit($event)"
              [readOnly]="readOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
          @case ('action') {
            <okr-button-action
              [formData]="action()" (formDataChange)="actionChange.emit($event)"
              [readOnly]="readOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
              [contracts]="contracts()"
            />
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class ButtonConfiguration {
  // inputs
  public readonly style = input<ButtonStyle, ButtonStyle | undefined>(BUTTON_STYLE_SHAPE, { transform: (v) => v ?? BUTTON_STYLE_SHAPE });
  public readonly icon = input<IconConfig, IconConfig | undefined>(ICON_CONFIG_SHAPE, { transform: (v) => v ?? ICON_CONFIG_SHAPE });
  public readonly action = input<ButtonActionConfig, ButtonActionConfig | undefined>(
    { type: ButtonAction.None, url: '' } as ButtonActionConfig,
    { transform: (v) => v ?? ({ type: ButtonAction.None, url: '' } as ButtonActionConfig) });
  public readonly contracts = input<ContractOption[]>([]);
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  // outputs
  public readonly styleChange = output<ButtonStyle>();
  public readonly iconChange = output<IconConfig>();
  public readonly actionChange = output<ButtonActionConfig>();

  protected readonly segment = signal<Segment>('button');
  private readonly errorSegments = computed(() => getErrorSegments(this.errors(), BUTTON_SEGMENT_FIELDS, SEGMENTS));

  protected hasErrors(segment: Segment): boolean {
    return this.errorSegments().includes(segment);
  }

  protected onSegmentChange(value: unknown): void {
    if (value === 'button' || value === 'icon' || value === 'action') this.segment.set(value);
  }
}
