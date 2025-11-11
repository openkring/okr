import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { PersonalRelCollection, PersonalRelModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { getFullPersonName, hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { PersonalRelFormComponent } from '@bk2/relationship-personal-rel-ui';
import { convertFormToPersonalRel, convertPersonalRelToForm } from '@bk2/relationship-personal-rel-util';
import { PersonalRelModalsService } from './personal-rel-modals.service';

@Component({
  selector: 'bk-personal-rel-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, HeaderComponent,
    ChangeConfirmationComponent, PersonalRelFormComponent,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header title="{{ modalTitle() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-personal-rel-form [(vm)]="vm" [currentUser]="currentUser()" 
      [types]="types()"
      [allTags]="tags()"
      (selectPerson)="selectPerson($event)"
      (validChange)="formIsValid.set($event)" />

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="personalRelCollection" [parentKey]="personalRelKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class PersonalRelEditModalComponent {
  private readonly personalRelModalsService = inject(PersonalRelModalsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public personalRel = input.required<PersonalRelModel>();
  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => convertPersonalRelToForm(this.personalRel()));
  protected tags = computed(() => this.appStore.getTags('personalrel'));
  protected types = computed(() => this.appStore.getCategory('personalrel_type'));

  protected readonly personalRelKey = computed(() => this.personalRel().bkey ?? '');
  protected readonly subjectUrl = computed(() => `/person/${this.vm().subjectKey}`);
  protected readonly subjectName = computed(() => getFullPersonName(this.vm().subjectFirstName ?? '', this.vm().subjectLastName ?? ''));
  protected readonly objectName = computed(() => getFullPersonName(this.vm().objectFirstName ?? '', this.vm().objectLastName ?? ''));
  protected readonly objectUrl = computed(() => `/person/${this.vm().objectKey}`);

  protected readonly modalTitle = computed(() => `@personalRel.operation.${hasRole('memberAdmin', this.currentUser()) ? 'update' : 'view'}.label`);

  protected formIsValid = signal(false);
  public personalRelCollection = PersonalRelCollection;

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToPersonalRel(this.personalRel(), this.vm(), this.appStore.env.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

 protected async selectPerson(isSubject: boolean): Promise<void> {
    const _person = await this.personalRelModalsService.selectPerson();
    if (!_person) return;
    if (isSubject) {
      this.vm.update((_vm) => ({
        ..._vm, 
        subjectKey: _person.bkey, 
        subjectFirstName: _person.firstName,
        subjectLastName: _person.lastName,
        subjectGender: _person.gender,
      }));
    } else {
      this.vm.update((_vm) => ({
        ..._vm, 
        objectKey: _person.bkey, 
        objectFirstName: _person.firstName,
        objectLastName: _person.lastName,
        objectGender: _person.gender,
      }));
    }
  }
}
