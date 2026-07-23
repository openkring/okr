import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';

import { InstrumentTopic } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';

import { INSTRUMENTS_I18N_KEYS } from '@okr/instruments-util';
import { TopicForm } from '@okr/instruments-ui';

/**
 * The card editor (spec D4 — edit-then-save over one topic; the live board stream keeps updating
 * underneath). Receives one `InstrumentTopic`, clones it, and dismisses with `confirm` (save),
 * `delete`, or nothing (cancel). It does not inject the store, so no store-DI contract applies.
 */
@Component({
  selector: 'okr-topic-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, TopicForm, SvgIconPipe, IonContent, IonButton, IonIcon],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as data) {
        <okr-topic-form
          [i18n]="i18n"
          [formData]="data"
          (formDataChange)="onFormDataChange($event)"
          [showScore]="showScore()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
        @if (!isReadOnly()) {
          <ion-button fill="clear" color="danger" (click)="remove()">
            <ion-icon src="{{ 'trash' | svgIcon }}" slot="start" />
            {{ i18n.delete() }}
          </ion-button>
        }
      }
    </ion-content>
  `,
})
export class TopicEditModal {
  private readonly modalController = inject(ModalController);
  private readonly i18nService = inject(I18nService);

  public readonly topic = input.required<InstrumentTopic>();
  public readonly readOnly = input(true);
  public readonly showScore = input(true);

  protected readonly i18n = this.i18nService.translateAll(INSTRUMENTS_I18N_KEYS);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.topic()));

  protected readonly title = computed(() => (this.isReadOnly() ? this.i18n.view() : (this.topic().label || this.i18n.create())));
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));

  protected onFormDataChange(data: InstrumentTopic): void {
    this.formData.set(data);
  }

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.topic()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  public async remove(): Promise<void> {
    await this.modalController.dismiss(undefined, 'delete');
  }
}
