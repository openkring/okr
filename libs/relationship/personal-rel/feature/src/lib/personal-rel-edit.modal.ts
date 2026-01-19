import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, PersonalRelModel, PersonalRelModelName, PersonModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, isPerson } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { DocumentsAccordionComponent } from '@bk2/document-feature';

import { PersonalRelFormComponent } from '@bk2/relationship-personal-rel-ui';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { PersonSelectModalComponent } from '@bk2/shared-feature';
import { ENV } from '@bk2/shared-config';

@Component({
  selector: 'bk-personal-rel-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordionComponent, HeaderComponent, DocumentsAccordionComponent,
    ChangeConfirmationComponent, PersonalRelFormComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-personal-rel-form
        [formData]="formData()"
        (formDataChange)="onFormDataChange($event)"
        [currentUser]="currentUser()" 
        [types]="types()"
        [allTags]="tags()"
        [readOnly]="isReadOnly()"
        [tenants]="env.tenantId"
        (selectPerson)="selectPerson($event)"
        (dirty)="formDirty.set($event)"
        (valid)="formValid.set($event)"
      />

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
export class PersonalRelEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly env = inject(ENV);

  // inputs
  public personalRel = input.required<PersonalRelModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public types = input.required<CategoryListModel>();
  public readonly readOnly = input<boolean>(true);

  // coerced boolean input variables
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => structuredClone(this.personalRel()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('personalRel', this.personalRel()?.bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${PersonalRelModelName}.${this.personalRel().bkey}`);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.personalRel()));  // reset the form
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
    if (isSubject) {
      this.formData.update((vm) => ({
        ...vm, 
        subjectKey: person.bkey, 
        subjectFirstName: person.firstName,
        subjectLastName: person.lastName,
        subjectGender: person.gender,
      }));
    } else {
      this.formData.update((vm) => ({
        ...vm, 
        objectKey: person.bkey, 
        objectFirstName: person.firstName,
        objectLastName: person.lastName,
        objectGender: person.gender,
      }));
    }
  }

  async selectPersonModal(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isPerson(data, this.env.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

 protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
