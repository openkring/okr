import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, Platform } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent, UploadService } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ENV } from '@bk2/shared/config';
import { GroupCollection, ModelType, RoleName } from '@bk2/shared/models';
import { Photo } from '@capacitor/camera';
import { hasRole } from '@bk2/shared/util-core';
import { AvatarService } from '@bk2/avatar/data-access';
import { getDocumentStoragePath } from '@bk2/document/util';

import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { MembersAccordionComponent } from '@bk2/membership/feature';
import { GroupEditStore } from './group-edit.store';
import { convertGroupToForm } from '@bk2/group/util';
import { GroupFormComponent } from '@bk2/group/ui';
import { newAvatarModel, readAsFile } from '@bk2/avatar/util';
import { AvatarToolbarComponent } from '@bk2/avatar/feature';

@Component({
  selector: 'bk-group-edit-page',
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
      <bk-avatar-toolbar key="{{avatarKey()}}" (imageSelected)="onImageSelected($event)" [isEditable]="hasRole('memberAdmin')" title="{{ title() }}"/>
      @if(group(); as group) {
        <bk-group-form [(vm)]="vm" [currentUser]="currentUser()" [groupTags]="groupTags()" (validChange)="formIsValid.set($event)" />

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

  protected currentUser = computed(() => this.groupEditStore.currentUser());
  protected group = computed(() => this.groupEditStore.group());
  public vm = linkedSignal(() => convertGroupToForm(this.group()));
  protected path = computed(() => getDocumentStoragePath(this.groupEditStore.tenantId(), ModelType.Group, this.group()?.bkey));
  protected avatarKey = computed(() => `${ModelType.Group}.${this.groupKey()}`);
  protected title = computed(() => this.group()?.name ?? '');
  protected groupTags = computed(() => this.groupEditStore.getTags());

  protected formIsValid = signal(false);
  protected modelType = ModelType;
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
    const _group = this.group();
    if (!_group) return;
    const _file = await readAsFile(photo, this.platform);
    const _avatar = newAvatarModel([this.env.tenantId], ModelType.Group, _group.bkey, _file.name);
    const _downloadUrl = await this.uploadService.uploadFile(_file, _avatar.storagePath, '@document.operation.upload.avatar.title')

    if (_downloadUrl) {
      await this.avatarService.updateOrCreate(_avatar);
    }
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
