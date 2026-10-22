import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { AvatarInfo, DiaryAlbumModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { DiaryI18n, avatarTitle } from '@okr/content-diary-util';
import { DiaryAlbumForm } from './diary-album.form';

@Component({
  selector: 'okr-diary-album-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, DiaryAlbumForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-diary-album-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()" [isNew]="isNew()" [currentUser]="currentUser()" [showForm]="showForm()"
          (selectClicked)="pick()" (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class DiaryAlbumEditModal {
  private readonly modalController = inject(ModalController);

  // inputs — no store injected: the pickers come in as callbacks
  public readonly album = input.required<DiaryAlbumModel>();
  public readonly isNew = input(false);
  public readonly i18n = input.required<DiaryI18n>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly selectPerson = input<() => Promise<AvatarInfo | undefined>>();
  public readonly selectLocation = input<() => Promise<AvatarInfo | undefined>>();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.album()) as DiaryAlbumModel);
  protected showForm = signal(true);

  protected readonly headerTitle = computed(() => (this.isNew() ? this.i18n().albums_add() : this.i18n().albums_edit()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(), save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  /** Applies a picked avatar; the title is prefilled from it when still empty. Also reachable for tests. */
  public applyRef(ref: AvatarInfo): void {
    this.formDirty.set(true);
    this.formData.update(vm => ({ ...vm, ref, title: vm.title?.trim() ? vm.title : avatarTitle(ref) }));
  }

  /** The form asked for a person or location; run the matching callback and apply what it resolved. */
  protected async pick(): Promise<void> {
    const picker = this.formData().kind === 'location' ? this.selectLocation() : this.selectPerson();
    const ref = await picker?.();
    if (ref) this.applyRef(ref);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.album()) as DiaryAlbumModel);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: DiaryAlbumModel): void {
    this.formData.set(formData);
  }
}
