import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, ScsMemberFeesModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { getFullName, safeStructuredClone } from '@okr/shared-util-core';

import { AvatarToolbar } from '@okr/avatar-feature';

import { ScsMemberFeeEditForm } from '@okr/relationship-membership-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { ScsMemberFeesStore } from './scs-member-fees.store';


@Component({
  selector: 'okr-scs-member-fee-edit-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ScsMemberFeesStore],
  imports: [
    ScsMemberFeeEditForm, Header, ChangeConfirmation, AvatarToolbar,
    IonContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-avatar-toolbar
        key="{{parentKey()}}"
        [title]="memberName()"
        modelType="person"
        [readOnly]="true"
      />
      <okr-scs-member-fee-edit-form
        [formData]="formData()"
        [currentUser]="currentUser()"
        [membershipCategories]="mcat()"
        [showForm]="showForm()"
        [readOnly]="readOnly()"
        [i18n]="store.i18n"
        (dirty)="manualDirty.set($event)"
        (valid)="formValid.set($event)"
        (formDataChange)="formData.set($event)"
      />
    </ion-content>
  `
})
export class ScsMemberFeeEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(ScsMemberFeesStore);

  // inputs
  public fee = input.required<ScsMemberFeesModel>();
  public currentUser = input.required<UserModel>();
  public mcat = input<CategoryListModel | undefined>(undefined);
  public readOnly = input(false);

  // signals
  protected formData = linkedSignal(() => safeStructuredClone(this.fee()));
  protected showForm = signal(true);
  protected formValid = signal(false);
  protected manualDirty = signal(false);

  // derived
  protected memberKey = computed(() => this.fee()?.member?.key ?? '');
  protected memberName = computed(() => getFullName(this.fee()?.member?.name1 ?? '', this.fee()?.member?.name2 ?? '', this.currentUser()?.nameDisplay));
  protected parentKey = computed(() => `person.${this.memberKey()}`);
  protected showConfirmation = computed(() => this.formValid() && this.manualDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  protected headerTitle = computed(() =>
    this.readOnly() ? this.store.i18n.view_label() : this.store.i18n.update_label()
  );

  public async save(): Promise<boolean> {
    return dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.manualDirty.set(false);
    this.formData.set(safeStructuredClone(this.fee()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
