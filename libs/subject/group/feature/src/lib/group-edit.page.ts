import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonContent, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupCollection, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, UploadService } from '@bk2/shared-ui';

import { AvatarService } from '@bk2/avatar-data-access';
import { AvatarToolbarComponent } from '@bk2/avatar-feature';
import { newAvatarModel, readAsFile } from '@bk2/avatar-util';
import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { getDocumentStoragePath } from '@bk2/document-util';
import { MembersAccordionComponent } from '@bk2/relationship-membership-feature';

import { GroupFormComponent } from '@bk2/subject-group-ui';
import { convertGroupToForm } from '@bk2/subject-group-util';

import { GroupEditStore } from './group-edit.store';

@Component({
  selector: 'bk-group-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, GroupFormComponent,
    AvatarToolbarComponent, CommentsAccordionComponent, MembersAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup
  ],
  providers: [GroupEditStore],
  template: `
    <bk-header title="{{ '@subject.group.operation.update.label' | translate | async }}" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-avatar-toolbar key="{{avatarKey()}}" (imageSelected)="onImageSelected($event)" [readOnly]="readOnly()" title="{{ title() }}"/>
      @if(group(); as group) {
        <bk-group-form [(vm)]="vm" 
          [currentUser]="currentUser()"
          [groupTags]="groupTags()"
          [readOnly]="readOnly()"
          (validChange)="formIsValid.set($event)" />

        <ion-accordion-group value="members" [multiple]="true">
          <bk-members-accordion [orgKey]="groupKey()" />
          <bk-comments-accordion [collectionName]="groupCollection" [parentKey]="groupKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class GroupEditPageComponent {
  private readonly avatarService = inject(AvatarService);
  private readonly groupEditStore = inject(GroupEditStore);
  private readonly uploadService = inject(UploadService);
  private readonly platform = inject(Platform);
  private readonly env = inject(ENV);

  public groupKey = input.required<string>();
  public readOnly = input(true);

  protected currentUser = computed(() => this.groupEditStore.currentUser());
  protected group = computed(() => this.groupEditStore.group());
  public vm = linkedSignal(() => convertGroupToForm(this.group()));
  protected path = computed(() => getDocumentStoragePath(this.groupEditStore.tenantId(), 'group', this.group()?.bkey));
  protected avatarKey = computed(() => `group.${this.groupKey()}`);
  protected title = computed(() => this.group()?.name ?? '');
  protected groupTags = computed(() => this.groupEditStore.getTags());

  protected formIsValid = signal(false);
  protected groupCollection = GroupCollection;

  constructor() {
    effect(() => {
      this.groupEditStore.setGroupKey(this.groupKey());
    });
  }

  public async save(): Promise<void> {
    await this.groupEditStore.save(this.vm());
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    const group = this.group();
    if (!group) return;
    const file = await readAsFile(photo, this.platform);
    const avatar = newAvatarModel([this.env.tenantId], 'group', group.bkey, file.name);
    const downloadUrl = await this.uploadService.uploadFile(file, avatar.storagePath, '@document.operation.upload.avatar.title')

    if (downloadUrl) {
      await this.avatarService.updateOrCreate(avatar);
    }
  }
}
