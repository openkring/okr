import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { PersonalRelModel, PersonalRelModelName, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { PersonalRelFormComponent } from '@bk2/relationship-personal-rel-ui';
import { convertFormToPersonalRel, convertPersonalRelToForm, PersonalRelFormModel } from '@bk2/relationship-personal-rel-util';
import { PersonalRelModalsService } from './personal-rel-modals.service';
import { getTitleLabel } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-personal-rel-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, HeaderComponent,
    ChangeConfirmationComponent, PersonalRelFormComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-personal-rel-form
        [formData]="formData()"
        [currentUser]="currentUser()" 
        [types]="types()"
        [allTags]="tags()"
        [readOnly]="isReadOnly()"
        (selectPerson)="selectPerson($event)"
        (formDataChange)="onFormDataChange($event)"
      />

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class PersonalRelEditModalComponent {
  private readonly personalRelModalsService = inject(PersonalRelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public personalRel = input.required<PersonalRelModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertPersonalRelToForm(this.personalRel()));

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('personalRel', this.personalRel()?.bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${PersonalRelModelName}.${this.personalRel().bkey}`);
  protected tags = computed(() => this.appStore.getTags('personalrel'));
  protected types = computed(() => this.appStore.getCategory('personalrel_type'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToPersonalRel(this.formData(), this.personalRel()), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertPersonalRelToForm(this.personalRel()));  // reset the form
  }

  protected onFormDataChange(formData: PersonalRelFormModel): void {
    this.formData.set(formData);
  }

 protected async selectPerson(isSubject: boolean): Promise<void> {
    const person = await this.personalRelModalsService.selectPerson();
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

 protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
