import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { RoleName } from '@bk2/shared/config';
import { GroupCollection, ModelType } from '@bk2/shared/models';
import { AvatarToolbarComponent } from '@bk2/avatar/ui';
import { Photo } from '@capacitor/camera';
import { hasRole } from '@bk2/shared/util';
import { AvatarService } from '@bk2/avatar/data-access';
import { getDocumentStoragePath } from '@bk2/document/util';

import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { MembersAccordionComponent } from '@bk2/membership/feature';
import { GroupEditStore } from './group-edit.store';
import { convertGroupToForm } from '@bk2/group/util';
import { GroupFormComponent } from '@bk2/group/ui';

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

  public async onImageSelected(photo: Photo): Promise<void> {
    const _group = this.group();
    if (!_group) return;
    await this.avatarService.uploadPhoto(photo, ModelType.Group, _group.bkey);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
