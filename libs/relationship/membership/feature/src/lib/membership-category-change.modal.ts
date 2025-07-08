import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared/ui';
import { CategoryListModel, MembershipModel, ModelType } from '@bk2/shared/models';
import { CategoryChangeFormComponent } from '@bk2/relationship/membership/ui';
import { convertMembershipToCategoryChangeForm, getMembershipName } from '@bk2/relationship/membership/util';

@Component({
  selector: 'bk-category-change-modal',
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, CategoryChangeFormComponent, RelationshipToolbarComponent,
    IonContent 
],
  template: `
    <bk-header title="{{ title() | translate | async}}" [isModal]="true" />
    @if(formIsValid()) {
        <bk-change-confirmation (okClicked)="save()" />
    } 
    <ion-content>
      <bk-relationship-toolbar [titleArguments]="titleArguments()" />

      <bk-category-change-form [(vm)]="vm" [membershipCategory]="membershipCategory()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `,
})
export class CategoryChangeModalComponent {
  private readonly modalController = inject(ModalController);

  public membership = input.required<MembershipModel>();
  public membershipCategory = input.required<CategoryListModel>();
  public title = input('@membership.operation.catChange.label');
  protected vm = linkedSignal(() => convertMembershipToCategoryChangeForm(this.membership()));

  protected readonly name = computed(() => getMembershipName(this.membership()));
  protected titleArguments = computed(() => ({
    relationship: 'membership',
    subjectName: this.name(),
    subjectIcon: this.membership().memberModelType === ModelType.Person ? 'person' : 'org',
    subjectUrl: this.membership().memberModelType === ModelType.Person ? `/person/${this.membership().memberKey}` : `/org/${this.membership().memberKey}`,
    objectName: this.membership().orgName,
    objectIcon: 'org',
    objectUrl: `/org/${this.membership().orgKey}`
  }));
  
  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }
}
