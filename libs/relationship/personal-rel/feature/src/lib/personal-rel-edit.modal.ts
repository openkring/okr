import { Component, computed, inject, input, linkedSignal, signal, Type } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, PersonalRelModel, PersonalRelModelName, PersonModel, PersonModelName, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, isPerson, safeStructuredClone } from '@bk2/shared-util-core';
import { PersonSelectModal } from '@bk2/shared-feature';

import { PERSON_EDIT_MODAL } from '@bk2/subject-person-ui';
import { CommentsAccordion } from '@bk2/comment-feature';
import { DocumentsAccordion } from '@bk2/document-feature';
import { PersonalRelForm } from '@bk2/relationship-personal-rel-ui';
import { PersonalRelStore } from './personal-rel.store';

@Component({
  selector: 'bk-personal-rel-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordion, Header, DocumentsAccordion,
    ChangeConfirmation, PersonalRelForm,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [PersonalRelStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-personal-rel-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()" 
          [types]="types()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          [tenants]="tenantId()"
          (selectPerson)="selectPerson($event)"
          (showPersonOutput)="onShowPerson($event)"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class PersonalRelEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(PersonalRelStore);
  private readonly personEditModalClass = inject<Type<unknown> | null>(PERSON_EDIT_MODAL, { optional: true });

  // inputs
  public personalRel = input.required<PersonalRelModel>();
  public currentUser = input.required<UserModel>();
  protected tenantId = computed(() => this.store.tenantId());
  public tags = input.required<string>();
  public types = input.required<CategoryListModel>();
  public readonly readOnly = input<boolean>(true);

  // coerced boolean input variables
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => safeStructuredClone(this.personalRel()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.personalRel()?.bkey));
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));
  protected readonly parentKey = computed(() => `${PersonalRelModelName}.${this.personalRel().bkey ?? ''}`);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.personalRel()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: PersonalRelModel): void {
    this.formData.set(formData);
  }

  protected async selectPerson(isSubject: boolean): Promise<void> {
    const person = await this.selectPersonModal();
    if (!person) return;
    
    const personData = {
      bkey: person.bkey ?? '',
      firstName: person.firstName ?? '',
      lastName: person.lastName ?? '',
      gender: person.gender ?? ''
    };
    
    if (isSubject) {
      this.formData.update((vm) => {
        if (!vm) return vm;
        return {
          ...vm, 
          subjectKey: personData.bkey, 
          subjectFirstName: personData.firstName,
          subjectLastName: personData.lastName,
          subjectGender: personData.gender,
        };
      });
    } else {
      this.formData.update((vm) => {
        if (!vm) return vm;
        return {
          ...vm, 
          objectKey: personData.bkey, 
          objectFirstName: personData.firstName,
          objectLastName: personData.lastName,
          objectGender: personData.gender,
        };
      });
    }
    
    // Mark form as dirty since we changed the data
    this.formDirty.set(true);
  }

  async selectPersonModal(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isPerson(data, this.tenantId())) {
        return data;
      }
    }
    return undefined;
  }

  protected async onShowPerson(personKey: string): Promise<void> {
    const person = this.store.appStore.getPerson(personKey);
    if (!person || !this.personEditModalClass) return;
    const modal = await this.modalController.create({
      component: this.personEditModalClass,
      componentProps: {
        person,
        currentUser: this.currentUser(),
        tags: this.store.getTags(PersonModelName),
        tenantId: this.store.tenantId(),
        genders: this.store.appStore.getCategory('gender'),
        readOnly: true,
      }
    });
    modal.present();
    await modal.onDidDismiss();
  }

 protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
