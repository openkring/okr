import { Component, computed, input, linkedSignal, model, signal, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonItem, IonNote, IonRow, IonTextarea, IonToggle } from '@ionic/angular/standalone';

import { TestimonialConfig } from '@okr/shared-models';
import { NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { parseTestimonials, stringifyTestimonials, withTestimonialDefaults } from '@okr/cms-section-util';

interface TestimonialConfigI18n {
  testimonial_title:            Signal<string>;
  testimonial_subtitle:         Signal<string>;
  testimonial_entries_label:    Signal<string>;
  testimonial_entries_helper:   Signal<string>;
  testimonial_entries_error:    Signal<string>;
  testimonial_carousel_label:   Signal<string>;
  testimonial_carousel_helper:  Signal<string>;
  testimonial_columns_label:    Signal<string>;
  testimonial_columns_helper:   Signal<string>;
}

@Component({
  selector: 'okr-testimonial-config',
  standalone: true,
  imports: [
    FormsModule,
    NumberInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle, IonGrid, IonRow, IonCol, IonItem, IonTextarea, IonNote, IonToggle
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-textarea { font-family: monospace; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().testimonial_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().testimonial_subtitle() }}</ion-card-subtitle>
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
                  [label]="i18n().testimonial_entries_label()"
                  labelPlacement="stacked"
                  fill="outline"
                  [rows]="12"
                  [autoGrow]="true"
                  [readonly]="readOnly()"
                  [ngModel]="draft()"
                  (ngModelChange)="draft.set($event)"
                  (ionBlur)="commitEntries()"
                />
              </ion-item>
              <ion-item lines="none">
                @if(jsonError()) {
                  <ion-note color="danger">{{ i18n().testimonial_entries_error() }}</ion-note>
                } @else {
                  <ion-note>{{ i18n().testimonial_entries_helper() }}</ion-note>
                }
              </ion-item>
            </ion-col>
            <ion-col size="12" size-md="6">
              <ion-item lines="none">
                <ion-toggle
                  [checked]="config().layout === 'carousel'"
                  [disabled]="readOnly()"
                  (ionChange)="onCarouselChange($event.detail.checked)"
                >{{ i18n().testimonial_carousel_label() }}</ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-note>{{ i18n().testimonial_carousel_helper() }}</ion-note>
              </ion-item>
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-number-input
                [i18n]="columnsI18n()" [value]="config().columns"
                (valueChange)="onColumnsChange($event)" [readOnly]="readOnly()" [showHelper]="true"
              />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class TestimonialConfiguration {
  // inputs
  public formData = model.required<TestimonialConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<TestimonialConfigI18n>();

  /** Legacy sections lack the newer fields — never bind the raw properties. */
  protected config = computed(() => withTestimonialDefaults(this.formData()));
  /** Raw JSON text in the editor; reseeded from formData, committed on blur. */
  protected draft = linkedSignal(() => stringifyTestimonials(this.config().entries));
  protected jsonError = signal(false);

  protected columnsI18n = computed(() => ({
    name: 'columns',
    label: this.i18n().testimonial_columns_label(),
    helper: this.i18n().testimonial_columns_helper(),
  } as NumberInputI18n));

  protected onCarouselChange(carousel: boolean): void {
    this.formData.set({ ...this.config(), layout: carousel ? 'carousel' : 'grid' });
  }

  protected onColumnsChange(columns: number): void {
    this.formData.set({ ...this.config(), columns });
  }

  protected commitEntries(): void {
    const text = this.draft();
    if (text.trim().length === 0) { // cleared editor = no testimonials
      this.jsonError.set(false);
      this.formData.set({ ...this.config(), entries: [] });
      return;
    }
    const entries = parseTestimonials(text);
    if (entries) {
      this.jsonError.set(false);
      this.formData.set({ ...this.config(), entries });
    } else {
      this.jsonError.set(true);
    }
  }
}
