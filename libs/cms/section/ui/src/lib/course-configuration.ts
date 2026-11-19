import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { APPLICATION_KIND_VALUES, ApplicationKind, CourseConfig } from '@okr/shared-models';
import { CheckboxGroup, CheckboxGroupI18n, ErrorNote, TextareaInput, TextInputI18n } from '@okr/shared-ui';
import { COURSE_EMPTY_TEXT_MAX_LENGTH, getFieldErrors, SectionErrors } from '@okr/cms-section-util';

interface CourseConfigI18n {
  course_title:             Signal<string>;
  course_subtitle:          Signal<string>;
  course_audience_label:    Signal<string>;
  course_audience_youth:    Signal<string>;
  course_audience_adult:    Signal<string>;
  course_audience_transfer: Signal<string>;
  course_empty_text_label:  Signal<string>;
  course_empty_text_helper: Signal<string>;
}

@Component({
  selector: 'okr-course-config',
  standalone: true,
  imports: [
    CheckboxGroup, TextareaInput, ErrorNote,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().course_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().course_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <okr-checkbox-group [i18n]="audienceI18n()" [stringList]="audienceKinds" [labels]="audienceLabels()"
                [selectedStrings]="audience()" (selectedStringsChange)="onAudienceChange($event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <okr-error-note [errors]="errorsFor('audience')" />
            </ion-col>
            <ion-col size="12">
              <okr-textarea-input [i18n]="emptyTextI18n()" [value]="emptyText()" (valueChange)="onEmptyTextChange($event)"
                [maxLength]="emptyTextMaxLength" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('emptyText')" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class CourseConfiguration {
  // inputs
  public formData = model.required<CourseConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<CourseConfigI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  /** kept in step with the cap the Vest suite enforces on emptyText */
  protected readonly emptyTextMaxLength = COURSE_EMPTY_TEXT_MAX_LENGTH;

  // fields
  protected readonly audienceKinds: string[] = APPLICATION_KIND_VALUES;
  protected audience = linkedSignal<string[]>(() => this.formData().audience ?? []);
  protected emptyText = linkedSignal(() => this.formData().emptyText ?? '');

  protected audienceI18n = computed(() => ({ name: 'audience', label: this.i18n().course_audience_label() } as CheckboxGroupI18n));
  protected audienceLabels = computed(() => [this.i18n().course_audience_youth(), this.i18n().course_audience_adult(), this.i18n().course_audience_transfer()]);

  protected emptyTextI18n = computed(() => ({
    name: 'emptyText',
    label: this.i18n().course_empty_text_label(),
    placeholder: '',
    helper: this.i18n().course_empty_text_helper(),
  } as TextInputI18n));

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  protected onAudienceChange(audience: string[]): void {
    this.formData.update((vm) => ({ ...vm, audience: audience as ApplicationKind[] }));
  }

  protected onEmptyTextChange(emptyText: string): void {
    this.formData.update((vm) => ({ ...vm, emptyText }));
  }
}
