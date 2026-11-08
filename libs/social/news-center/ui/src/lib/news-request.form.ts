import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonSegment, IonSegmentButton, IonLabel } from '@ionic/angular';

import { NEWS_SEGMENTS, NewsSegment } from '@okr/shared-models';
import { ErrorNote, TextareaInput, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { NEWS_REQUEST_NOTE_MAX, NewsCenterI18n, NewsRequestFormData, newsRequestValidations } from '@okr/social-news-center-util';

/** The suggest-a-channel fields (segment, link, note). The parent drives sending; there is no submit button here. */
@Component({
  selector: 'okr-news-request-form',
  standalone: true,
  imports: [IonCard, IonCardContent, IonSegment, IonSegmentButton, IonLabel, TextInput, TextareaInput, ErrorNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <form novalidate>
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-segment [value]="formData().segment" (ionChange)="onSegmentChange($event.detail.value)">
            @for (seg of segments; track seg) {
              <ion-segment-button [value]="seg"><ion-label>{{ segmentLabel(seg) }}</ion-label></ion-segment-button>
            }
          </ion-segment>
          <okr-error-note [errors]="segmentErrors()" />
          <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)"
            [autofocus]="true" [maxLength]="urlLength" [readOnly]="false" inputMode="url" />
          <okr-error-note [errors]="urlErrors()" />
          <okr-textarea-input [i18n]="noteI18n()" [value]="note()" (valueChange)="onFieldChange('note', $event)"
            [maxLength]="noteLength" [rows]="3" [readOnly]="false" />
          <okr-error-note [errors]="noteErrors()" />
        </ion-card-content>
      </ion-card>
    </form>
  `,
})
export class NewsRequestForm {
  public readonly i18n = input.required<NewsCenterI18n>();
  public readonly formData = model.required<NewsRequestFormData>();

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly requestForm = form(this.formData, (path) => validateVestTree(path, newsRequestValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.requestForm().valid()));
  }

  protected readonly segments = NEWS_SEGMENTS;
  /** kept in step with the cap the Vest suite enforces on `note` */
  protected readonly noteLength = NEWS_REQUEST_NOTE_MAX;
  /** a link has no cap in the suite; this is only a sane typing limit */
  protected readonly urlLength = 2000;

  protected readonly url = computed(() => this.formData()?.url ?? '');
  protected readonly note = computed(() => this.formData()?.note ?? '');
  protected readonly segmentErrors = computed(() => this.requestForm.segment().errors().map((e) => e.message ?? ''));
  protected readonly urlErrors = computed(() => this.requestForm.url().errors().map((e) => e.message ?? ''));
  protected readonly noteErrors = computed(() => this.requestForm.note().errors().map((e) => e.message ?? ''));

  protected readonly urlI18n = computed(() => ({
    name: 'url', label: this.i18n().link_label(), placeholder: this.i18n().link_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly noteI18n = computed(() => ({
    name: 'note', label: this.i18n().note_label(), placeholder: this.i18n().note_placeholder(), helper: '',
  } as TextInputI18n));

  protected segmentLabel(segment: NewsSegment): string {
    return this.i18n()[`segment_${segment}`]();
  }

  protected onSegmentChange(value: string | number | null | undefined): void {
    if (value) this.onFieldChange('segment', String(value));
  }

  protected onFieldChange(fieldName: keyof NewsRequestFormData, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
