import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { AppStore, OrgSelectModal } from '@bk2/shared-feature';
import { getDefaultCategoryName, isOrg } from '@bk2/shared-util-core';
import { CategoryListModel, OrgModel, UserModel } from '@bk2/shared-models';
import { signalStore, withProps } from '@ngrx/signals';

import { createNewMemberFormModel, MemberNewFormModel } from '@bk2/relationship-membership-util';
import { MemberNewForm, MemberNewFormI18n } from '@bk2/relationship-membership-ui';
import { PFX } from './scope';

const UI = '@relationship/membership/ui.';

// Cannot use MembershipStore here — it imports MemberNewModal, which would create a circular dependency.
const MemberNewModalStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      // ChangeConfirmation keys
      changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
      changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
      changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
      // MemberNewForm keys
      personDetails:          UI + 'person.details',
      personAddress:          UI + 'person.address',
      personMisc:             UI + 'person.misc',
      personMembership:       UI + 'person.membership',
      selectLabel:            UI + 'newDesc',
      firstName_label:        UI + 'firstName.label',
      firstName_placeholder:  UI + 'firstName.placeholder',
      firstName_helper:       UI + 'firstName.helper',
      lastName_label:         UI + 'lastName.label',
      lastName_placeholder:   UI + 'lastName.placeholder',
      lastName_helper:        UI + 'lastName.helper',
      streetName_label:       UI + 'streetName.label',
      streetName_placeholder: UI + 'streetName.placeholder',
      streetName_helper:      UI + 'streetName.helper',
      streetNumber_label:     UI + 'streetNumber.label',
      streetNumber_placeholder: UI + 'streetNumber.placeholder',
      streetNumber_helper:    UI + 'streetNumber.helper',
      countryCode_label:      UI + 'countryCode.label',
      countryCode_placeholder: UI + 'countryCode.placeholder',
      countryCode_helper:     UI + 'countryCode.helper',
      zipCode_label:          UI + 'zipCode.label',
      zipCode_placeholder:    UI + 'zipCode.placeholder',
      zipCode_helper:         UI + 'zipCode.helper',
      city_label:             UI + 'city.label',
      city_placeholder:       UI + 'city.placeholder',
      city_helper:            UI + 'city.helper',
      web_label:              UI + 'web.label',
      web_placeholder:        UI + 'web.placeholder',
      web_helper:             UI + 'web.helper',
      ssnId_label:            UI + 'ssnId.label',
      ssnId_placeholder:      UI + 'ssnId.placeholder',
      ssnId_helper:           UI + 'ssnId.helper',
      bexioId_label:          UI + 'bexioId.label',
      bexioId_placeholder:    UI + 'bexioId.placeholder',
      bexioId_helper:         UI + 'bexioId.helper',
      notes_label:            UI + 'notes.label',
      notes_placeholder:      UI + 'notes.placeholder',
      email_label:            UI + 'email.label',
      email_placeholder:      UI + 'email.placeholder',
      phone_label:            UI + 'phone.label',
      phone_placeholder:      UI + 'phone.placeholder',
      dateOfBirth_label:      UI + 'dateOfBirth.label',
      dateOfBirth_placeholder: UI + 'dateOfBirth.placeholder',
      dateOfBirth_helper:     UI + 'dateOfBirth.helper',
      dateOfDeath_label:      UI + 'dateOfDeath.label',
      dateOfDeath_placeholder: UI + 'dateOfDeath.placeholder',
      dateOfDeath_helper:     UI + 'dateOfDeath.helper',
      dateOfEntry_label:      UI + 'dateOfEntry.label',
      dateOfEntry_placeholder: UI + 'dateOfEntry.placeholder',
      dateOfEntry_helper:     UI + 'dateOfEntry.helper',
    } satisfies Record<string, string>),
  })),
);

@Component({
  selector: 'bk-member-new-modal',
  standalone: true,
  providers: [MemberNewModalStore],
  imports: [
    Header, ChangeConfirmation, MemberNewForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: '@membership.operation.createMember.label' }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-member-new-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [genders]="genders()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="false"
          [membershipCategories]="selectedMembershipCategory()"
          [i18n]="formI18n()"
          (selectClicked)="selectOrg()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      } @else {
        <div style="padding: 20px;">Loading form data...</div>
      }
    </ion-content>
  `
})
export class MemberNewModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  protected readonly store = inject(MemberNewModalStore);

  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  protected readonly formI18n = computed<MemberNewFormI18n>(() => ({
    personDetails:          this.store.i18n.personDetails,
    personAddress:          this.store.i18n.personAddress,
    personMisc:             this.store.i18n.personMisc,
    personMembership:       this.store.i18n.personMembership,
    selectLabel:            this.store.i18n.selectLabel,
    firstName_label:        this.store.i18n.firstName_label,
    firstName_placeholder:  this.store.i18n.firstName_placeholder,
    firstName_helper:       this.store.i18n.firstName_helper,
    lastName_label:         this.store.i18n.lastName_label,
    lastName_placeholder:   this.store.i18n.lastName_placeholder,
    lastName_helper:        this.store.i18n.lastName_helper,
    streetName_label:       this.store.i18n.streetName_label,
    streetName_placeholder: this.store.i18n.streetName_placeholder,
    streetName_helper:      this.store.i18n.streetName_helper,
    streetNumber_label:     this.store.i18n.streetNumber_label,
    streetNumber_placeholder: this.store.i18n.streetNumber_placeholder,
    streetNumber_helper:    this.store.i18n.streetNumber_helper,
    countryCode_label:      this.store.i18n.countryCode_label,
    countryCode_placeholder: this.store.i18n.countryCode_placeholder,
    countryCode_helper:     this.store.i18n.countryCode_helper,
    zipCode_label:          this.store.i18n.zipCode_label,
    zipCode_placeholder:    this.store.i18n.zipCode_placeholder,
    zipCode_helper:         this.store.i18n.zipCode_helper,
    city_label:             this.store.i18n.city_label,
    city_placeholder:       this.store.i18n.city_placeholder,
    city_helper:            this.store.i18n.city_helper,
    web_label:              this.store.i18n.web_label,
    web_placeholder:        this.store.i18n.web_placeholder,
    web_helper:             this.store.i18n.web_helper,
    ssnId_label:            this.store.i18n.ssnId_label,
    ssnId_placeholder:      this.store.i18n.ssnId_placeholder,
    ssnId_helper:           this.store.i18n.ssnId_helper,
    bexioId_label:          this.store.i18n.bexioId_label,
    bexioId_placeholder:    this.store.i18n.bexioId_placeholder,
    bexioId_helper:         this.store.i18n.bexioId_helper,
    notes_label:            this.store.i18n.notes_label,
    notes_placeholder:      this.store.i18n.notes_placeholder,
    email_label:            this.store.i18n.email_label,
    email_placeholder:      this.store.i18n.email_placeholder,
    phone_label:            this.store.i18n.phone_label,
    phone_placeholder:      this.store.i18n.phone_placeholder,
    dateOfBirth_label:      this.store.i18n.dateOfBirth_label,
    dateOfBirth_placeholder: this.store.i18n.dateOfBirth_placeholder,
    dateOfBirth_helper:     this.store.i18n.dateOfBirth_helper,
    dateOfDeath_label:      this.store.i18n.dateOfDeath_label,
    dateOfDeath_placeholder: this.store.i18n.dateOfDeath_placeholder,
    dateOfDeath_helper:     this.store.i18n.dateOfDeath_helper,
    dateOfEntry_label:      this.store.i18n.dateOfEntry_label,
    dateOfEntry_placeholder: this.store.i18n.dateOfEntry_placeholder,
    dateOfEntry_helper:     this.store.i18n.dateOfEntry_helper,
  }));

  // inputs
  public currentUser = input.required<UserModel>();
  public mcat = input.required<CategoryListModel>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();
  public genders = input.required<CategoryListModel>();
  public org = input.required<OrgModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected selectedMembershipCategory = linkedSignal(() => this.mcat());

  public formData = linkedSignal(() => {
    const org = this.org();
    return createNewMemberFormModel(org);
  });

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(createNewMemberFormModel(this.org()));  // reset the form
  }

  protected onFormDataChange(formData: MemberNewFormModel): void {
    this.formData.set(formData);
  }

  protected async selectOrg(): Promise<void> {
    const modal = await this.modalController.create({
      component: OrgSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: 'selectable',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.tenantId())) {
        // Get the full org from AppStore to extract membershipCategoryKey
        const selectedOrg = this.appStore.getOrg(data.bkey);
        const membershipCategoryKey = selectedOrg?.membershipCategoryKey;

        // Get the CategoryListModel using AppStore.getCategory
        if (membershipCategoryKey) {
          const membershipCategory = this.appStore.getCategory(membershipCategoryKey);
          this.selectedMembershipCategory.set(membershipCategory);
        }

        this.formData.update((vm) => ({
          ...vm,
          orgKey: data.bkey,
          orgName: data.name,
          category: getDefaultCategoryName(this.selectedMembershipCategory()),
        }));
      }
    }
  }
}
