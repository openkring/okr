import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { ApplicationKind, CourseConfig } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, TextareaInput, TextInputI18n } from '@okr/shared-ui';
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
    Checkbox, TextareaInput, ErrorNote,
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
              <strong>{{ i18n().course_audience_label() }}</strong>
            </ion-col>
            <ion-col size="12" size-md="4">
              <okr-checkbox [i18n]="youthI18n()" [checked]="isSelected('youth')" (checkedChange)="onAudienceChange('youth', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="4">
              <okr-checkbox [i18n]="adultI18n()" [checked]="isSelected('adult')" (checkedChange)="onAudienceChange('adult', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="4">
              <okr-checkbox [i18n]="transferI18n()" [checked]="isSelected('transfer')" (checkedChange)="onAudienceChange('transfer', $event)" [readOnly]="readOnly()" />
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
  protected audience = linkedSignal(() => this.formData().audience ?? []);
  protected emptyText = linkedSignal(() => this.formData().emptyText ?? '');

  protected youthI18n = computed(() => this.kindI18n('youth', this.i18n().course_audience_youth()));
  protected adultI18n = computed(() => this.kindI18n('adult', this.i18n().course_audience_adult()));
  protected transferI18n = computed(() => this.kindI18n('transfer', this.i18n().course_audience_transfer()));

  protected emptyTextI18n = computed(() => ({
    name: 'emptyText',
    label: this.i18n().course_empty_text_label(),
    placeholder: '',
    helper: this.i18n().course_empty_text_helper(),
  } as TextInputI18n));

  private kindI18n(kind: ApplicationKind, label: string): CheckboxI18n {
    return { name: `audience_${kind}`, label, helper: '' };
  }

  protected isSelected(kind: ApplicationKind): boolean {
    return this.audience().includes(kind);
  }

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  protected onAudienceChange(kind: ApplicationKind, selected: boolean): void {
    const without = this.audience().filter((k) => k !== kind);
    const audience = selected ? [...without, kind] : without;
    this.formData.update((vm) => ({ ...vm, audience }));
  }

  protected onEmptyTextChange(emptyText: string): void {
    this.formData.update((vm) => ({ ...vm, emptyText }));
  }
}
