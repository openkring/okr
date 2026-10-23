import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';
import { LEARNING_I18N_KEYS, LearningI18n, LearningRoomFormData } from '@okr/content-learning-util';

import { LearningFolderOption, LearningRoomForm } from './learning-room.form';

const EMPTY_ROOM: LearningRoomFormData = {
  name: '', mode: 'menu', groupKey: '', folder: '', createFolder: false, topics: '', curators: [], defaultTab: 'files',
};

/**
 * Creates or edits a learning room (spec 1.115 §6) and dismisses with the edited
 * {@link LearningRoomFormData} and role 'confirm'. Saving (page, section, folder) is the caller's job.
 */
@Component({
  selector: 'okr-learning-room-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, LearningRoomForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-learning-room-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [allTopics]="allTopics()"
          [folders]="folders()"
          [groupName]="groupName()"
          [personNames]="personNames()"
          [tenantId]="tenantId()"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class LearningRoomEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: a feature store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(LEARNING_I18N_KEYS) as LearningI18n;

  // inputs
  public readonly room = input<LearningRoomFormData>(EMPTY_ROOM);
  /** true: the header says «Neuer Lernraum» */
  public readonly isNew = input(false);
  /** all document tags of the tenant (comma-separated) */
  public readonly allTopics = input('');
  public readonly folders = input<LearningFolderOption[]>([]);
  public readonly groupName = input('');
  public readonly personNames = input<Record<string, string>>({});
  public readonly tenantId = input('');
  public readonly readOnly = input(false);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData = linkedSignal<LearningRoomFormData>(() => this.initial());
  protected showForm = signal(true);

  protected readonly headerTitle = computed(() => (this.isNew() ? this.i18n.roomForm_newTitle() : this.i18n.roomForm_title()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.form_cancel(),
    save: this.i18n.form_save(),
  } as ChangeConfirmationI18n));

  private initial(): LearningRoomFormData {
    return { ...EMPTY_ROOM, ...safeStructuredClone(this.room()) };
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  protected onFormDataChange(formData: LearningRoomFormData): void {
    this.formData.set(formData);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initial());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}
