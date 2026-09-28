import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { HearingQuizNodeModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { HearingQuizMediaService } from '@okr/games-hearing-quiz-data-access';
import { HearingQuizFolderOption, HearingQuizNodeForm } from '@okr/games-hearing-quiz-ui';
import { HEARING_QUIZ_I18N_KEYS, HearingQuizI18n } from '@okr/games-hearing-quiz-util';

/**
 * Header + change-confirmation + the node form (the `building-forms` structure). It lives in the
 * FEATURE lib, not in ui, for exactly one reason: it uploads the clip and the hint image the form
 * emits, which needs `HearingQuizMediaService`. It does not inject the tree store.
 *
 * An uploaded file is written into `formData` right away and marks the form dirty; if the user
 * then cancels, the file stays orphaned in storage — harmless, and the same trade-off every other
 * upload in the app makes.
 */
@Component({
  selector: 'okr-hearing-quiz-node-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, HearingQuizNodeForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-hearing-quiz-node-form
          [formData]="formData"
          (formDataChange)="formData$.set($event)"
          [i18n]="i18n"
          [folderOptions]="folderOptions()"
          [hasChildren]="hasChildren()"
          [audioBusy]="uploading()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (audioSelected)="onAudioSelected($event)"
          (hintImageSelected)="onHintImageSelected($event)"
        />
      }
    </ion-content>
  `,
})
export class HearingQuizNodeEditModal {
  private readonly modalController = inject(ModalController);
  private readonly mediaService = inject(HearingQuizMediaService);
  protected readonly i18n = inject(I18nService).translateAll(HEARING_QUIZ_I18N_KEYS) as HearingQuizI18n;

  // inputs
  public readonly node = input.required<HearingQuizNodeModel>();
  public readonly folderOptions = input<HearingQuizFolderOption[]>([]);
  public readonly hasChildren = input(false);
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // state
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly uploading = signal(false);
  protected readonly showForm = signal(true);
  public readonly formData = linkedSignal<HearingQuizNodeModel>(() => safeStructuredClone(this.node()) as HearingQuizNodeModel);
  /** alias used by the template's two-way binding (the @if local shadows `formData`) */
  protected readonly formData$ = this.formData;

  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view_label();
    return this.node().okey ? this.i18n.edit_label() : this.i18n.create_label();
  });
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.uploading());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.node()) as HearingQuizNodeModel);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected async onAudioSelected(file: File): Promise<void> {
    this.uploading.set(true);
    try {
      const upload = await this.mediaService.uploadAudio(file, this.node().okey, this.i18n.upload_title());
      if (!upload) return;
      this.formData.update(vm => ({ ...vm, audioUrl: upload.url, audioPath: upload.path }));
      this.formDirty.set(true);
    } finally {
      this.uploading.set(false);
    }
  }

  protected async onHintImageSelected(file: File): Promise<void> {
    this.uploading.set(true);
    try {
      const upload = await this.mediaService.uploadImage(file, this.node().okey, this.i18n.upload_title());
      if (!upload) return;
      this.formData.update(vm => ({ ...vm, hintImageUrl: upload.url }));
      this.formDirty.set(true);
    } finally {
      this.uploading.set(false);
    }
  }
}
