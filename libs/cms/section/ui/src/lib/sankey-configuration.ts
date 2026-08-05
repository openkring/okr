import { Component, computed, input, linkedSignal, model, signal, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonItem, IonNote, IonRow, IonTextarea } from '@ionic/angular/standalone';

import { SankeyConfig } from '@okr/shared-models';
import { NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { parseSankeyFlows, stringifySankeyFlows, withSankeyDefaults } from '@okr/cms-section-util';

interface SankeyConfigI18n {
  sankey_title:                     Signal<string>;
  sankey_subtitle:                  Signal<string>;
  sankey_flows_label:               Signal<string>;
  sankey_flows_helper:              Signal<string>;
  sankey_flows_error:               Signal<string>;
  sankey_nodeWidth_label:           Signal<string>;
  sankey_nodeGap_label:             Signal<string>;
  sankey_lineOpacity_label:         Signal<string>;
  sankey_layoutIterations_label:    Signal<string>;
  sankey_layoutIterations_helper:   Signal<string>;
}

@Component({
  selector: 'okr-sankey-config',
  standalone: true,
  imports: [
    FormsModule,
    NumberInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle, IonGrid, IonRow, IonCol, IonItem, IonTextarea, IonNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-textarea { font-family: monospace; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().sankey_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().sankey_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }

        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <ion-item lines="none">
                <ion-textarea
                  [label]="i18n().sankey_flows_label()"
                  labelPlacement="stacked"
                  fill="outline"
                  [rows]="10"
                  [autoGrow]="true"
                  [readonly]="readOnly()"
                  [ngModel]="draft()"
                  (ngModelChange)="draft.set($event)"
                  (ionBlur)="commitFlows()"
                />
              </ion-item>
              <ion-item lines="none">
                @if(jsonError()) {
                  <ion-note color="danger">{{ i18n().sankey_flows_error() }}</ion-note>
                } @else {
                  <ion-note>{{ i18n().sankey_flows_helper() }}</ion-note>
                }
              </ion-item>
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="nodeWidthI18n()" [value]="config().nodeWidth" (valueChange)="onFieldChange('nodeWidth', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="nodeGapI18n()" [value]="config().nodeGap" (valueChange)="onFieldChange('nodeGap', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="lineOpacityI18n()" [value]="config().lineOpacity" (valueChange)="onFieldChange('lineOpacity', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="layoutIterationsI18n()" [value]="config().layoutIterations" (valueChange)="onFieldChange('layoutIterations', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class SankeyConfiguration {
  // inputs
  public formData = model.required<SankeyConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SankeyConfigI18n>();

  /** Legacy sections lack the newer fields — never bind the raw properties. */
  protected config = computed(() => withSankeyDefaults(this.formData()));
  /** Raw JSON text in the editor; reseeded from formData, committed on blur. */
  protected draft = linkedSignal(() => stringifySankeyFlows(this.config().flows));
  protected jsonError = signal(false);

  protected nodeWidthI18n = computed(() => ({ name: 'nodeWidth', label: this.i18n().sankey_nodeWidth_label() } as NumberInputI18n));
  protected nodeGapI18n = computed(() => ({ name: 'nodeGap', label: this.i18n().sankey_nodeGap_label() } as NumberInputI18n));
  protected lineOpacityI18n = computed(() => ({ name: 'lineOpacity', label: this.i18n().sankey_lineOpacity_label() } as NumberInputI18n));
  protected layoutIterationsI18n = computed(() => ({
    name: 'layoutIterations',
    label: this.i18n().sankey_layoutIterations_label(),
    helper: this.i18n().sankey_layoutIterations_helper(),
  } as NumberInputI18n));

  protected onFieldChange(fieldName: keyof SankeyConfig, fieldValue: number): void {
    this.formData.set({ ...this.config(), [fieldName]: fieldValue });
  }

  protected commitFlows(): void {
    const text = this.draft();
    if (text.trim().length === 0) { // cleared editor = no flows
      this.jsonError.set(false);
      this.formData.set({ ...this.config(), flows: [] });
      return;
    }
    const flows = parseSankeyFlows(text);
    if (flows) {
      this.jsonError.set(false);
      this.formData.set({ ...this.config(), flows });
    } else {
      this.jsonError.set(text.trim().length > 0);
    }
  }
}
