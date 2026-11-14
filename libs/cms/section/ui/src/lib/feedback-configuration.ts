import { Component, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { SECTION_FEEDBACK_DEFAULT, SectionFeedback } from '@okr/shared-models';
import { Checkbox, CheckboxI18n } from '@okr/shared-ui';
import { SectionI18n } from '@okr/cms-section-util';

/**
 * Travel journal (spec 1.154 §7): where guests and authors may comment and react.
 * Shows the stored value (absent = all on) and emits the complete four-field object, but only when the user
 * changes a toggle — so opening a section never writes a `feedback` object.
 */
@Component({
  selector: 'okr-feedback-config',
  standalone: true,
  imports: [Checkbox, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().feedback_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <small>{{ i18n().feedback_helper() }}</small>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="commentsI18n()" [checked]="value().comments" (checkedChange)="onChange('comments', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="reactionsI18n()" [checked]="value().reactions" (checkedChange)="onChange('reactions', $event)" [readOnly]="readOnly()" />
            </ion-col>
            @if (showImages()) {
              <ion-col size="12" size-md="6">
                <okr-checkbox [i18n]="imageCommentsI18n()" [checked]="value().imageComments" (checkedChange)="onChange('imageComments', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-checkbox [i18n]="imageReactionsI18n()" [checked]="value().imageReactions" (checkedChange)="onChange('imageReactions', $event)" [readOnly]="readOnly()" />
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class FeedbackConfiguration {
  /** the stored value; undefined = not configured = everything on */
  public readonly feedback = input<SectionFeedback | undefined>(undefined);
  /** article and album only: the two image toggles */
  public readonly showImages = input(false);
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();
  public readonly feedbackChange = output<SectionFeedback>();

  protected readonly value = computed(() => this.feedback() ?? SECTION_FEEDBACK_DEFAULT);

  protected commentsI18n = computed(() => ({ name: 'feedbackComments', label: this.i18n().feedback_comments(), helper: '' } as CheckboxI18n));
  protected reactionsI18n = computed(() => ({ name: 'feedbackReactions', label: this.i18n().feedback_reactions(), helper: '' } as CheckboxI18n));
  protected imageCommentsI18n = computed(() => ({ name: 'feedbackImageComments', label: this.i18n().feedback_image_comments(), helper: '' } as CheckboxI18n));
  protected imageReactionsI18n = computed(() => ({ name: 'feedbackImageReactions', label: this.i18n().feedback_image_reactions(), helper: '' } as CheckboxI18n));

  protected onChange(key: keyof SectionFeedback, checked: boolean): void {
    if (this.readOnly() || this.value()[key] === checked) return;
    this.feedbackChange.emit({ ...this.value(), [key]: checked });
  }
}
