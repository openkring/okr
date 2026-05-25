import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { getFullName, safeStructuredClone } from '@bk2/shared-util-core';
import { signalStore, withProps } from '@ngrx/signals';

import { AvatarToolbar } from '@bk2/avatar-feature';

import { ScsMemberFeeEditForm } from '@bk2/relationship-membership-ui';
import { ScsMemberFeesStore } from './scs-member-fees.store';


@Component({
  selector: 'bk-scs-member-fee-edit-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ScsMemberFeesStore],
  imports: [
    ScsMemberFeeEditForm, Header, ChangeConfirmation, AvatarToolbar,
    IonContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]="true" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-avatar-toolbar
        key="{{parentKey()}}"
        [title]="memberName()"
        modelType="person"
        [readOnly]="true"
      />
      <bk-scs-member-fee-edit-form
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
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));

  protected headerTitle = computed(() =>
    this.readOnly() ? '@finance.scsMemberFee.operation.view.label' : '@finance.scsMemberFee.operation.update.label'
  );

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.manualDirty.set(false);
    this.formData.set(safeStructuredClone(this.fee()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
