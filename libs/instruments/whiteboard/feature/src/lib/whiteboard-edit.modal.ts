import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { UserModel, WhiteboardModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { WhiteboardForm, WhiteboardTemplateOption } from '@okr/instruments-whiteboard-ui';
import { WHITEBOARD_I18N_KEYS, WhiteboardI18n, WHITEBOARD_TEMPLATES } from '@okr/instruments-whiteboard-util';

/**
 * Create / rename modal for a whiteboard's metadata (name, description, template, tags). The canvas
 * itself is edited on the editor page. Clones the input into a `linkedSignal` and returns it via
 * `dismiss(formData, 'confirm')`; the parent store persists (change-confirmation drives saving).
 */
@Component({
  selector: 'okr-whiteboard-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, WhiteboardForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-whiteboard-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [allTags]="allTags()"
          [templateOptions]="templateOptions()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class WhiteboardEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(WHITEBOARD_I18N_KEYS) as WhiteboardI18n;
  protected readonly appStore = inject(AppStore);
  private readonly templateLabels = inject(I18nService).translateAll(
    Object.fromEntries(WHITEBOARD_TEMPLATES.map(t => [t.key || 'blank', t.labelKey])),
  );

  public readonly whiteboard = input.required<WhiteboardModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.whiteboard()));
  protected showForm = signal(true);

  protected readonly allTags = computed(() => this.appStore.getTags('whiteboard'));
  protected readonly templateOptions = computed<WhiteboardTemplateOption[]>(() =>
    WHITEBOARD_TEMPLATES.map(t => ({ key: t.key, label: this.templateLabels[t.key || 'blank']() })),
  );

  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view_label();
    return this.whiteboard().okey ? this.i18n.edit_label() : this.i18n.create_label();
  });
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.whiteboard()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: WhiteboardModel): void {
    this.formData.set(formData);
  }
}
