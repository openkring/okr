import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModelName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { AvatarToolbarComponent } from '@bk2/avatar-feature';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { getDocumentStoragePath } from '@bk2/document-util';
import { MembersAccordionComponent } from '@bk2/relationship-membership-feature';
import { GroupFormComponent } from '@bk2/subject-group-ui';
import { convertGroupToForm, GroupFormModel } from '@bk2/subject-group-util';

import { DEFAULT_TITLE } from '@bk2/shared-constants';

import { GroupEditStore } from './group-edit.store';

@Component({
  selector: 'bk-group-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, GroupFormComponent,
    AvatarToolbarComponent, CommentsAccordionComponent, MembersAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [GroupEditStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} } `],
  template: `
    <bk-header title="{{ title() | translate | async }}" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      <bk-avatar-toolbar key="{{parentKey()}}" (imageSelected)="onImageSelected($event)" [readOnly]="isReadOnly()" title="{{ avatarTitle() }}"/>
      @if(formData(); as formData) {
        <bk-group-form
          [formData]="formData" 
          [currentUser]="currentUser()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (formDataChange)="onFormDataChange($event)"
        />
      }

      @if(group(); as group) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="members" [multiple]="true">
              <bk-members-accordion [orgKey]="groupKey()" [readOnly]="isReadOnly()" />
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class GroupEditPageComponent {
  private readonly groupEditStore = inject(GroupEditStore);

  // inputs
  public groupKey = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => convertGroupToForm(this.group()));

  // derived signals and fields
  protected title = computed(() => getTitleLabel('subject.group', this.group()?.bkey, this.isReadOnly()));
  protected avatarTitle = computed(() => this.group()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${GroupModelName}.${this.groupKey()}`);
  protected currentUser = computed(() => this.groupEditStore.currentUser());
  protected group = computed(() => this.groupEditStore.group());
  protected path = computed(() => getDocumentStoragePath(this.groupEditStore.tenantId(), 'group', this.group()?.bkey));
  protected avatarKey = computed(() => `group.${this.groupKey()}`);
  protected tags = computed(() => this.groupEditStore.getTags());

  constructor() {
    effect(() => {
      this.groupEditStore.setGroupKey(this.groupKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.groupEditStore.save(this.formData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertGroupToForm(this.group()));  // reset the form
  }

  protected onFormDataChange(formData: GroupFormModel): void {
    this.formData.set(formData);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.groupEditStore.saveAvatar(photo);
  }
}
