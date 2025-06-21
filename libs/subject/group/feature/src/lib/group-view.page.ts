import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonMenuButton, IonPopover, IonSegment, IonSegmentButton, IonSegmentContent, IonSegmentView, IonTitle, IonToolbar, Platform } from '@ionic/angular/standalone';
import { Photo } from '@capacitor/camera';

import { ChangeConfirmationComponent, UploadService } from '@bk2/shared/ui';
import { ENV, RoleName } from '@bk2/shared/config';
import { GroupCollection, ModelType } from '@bk2/shared/models';
import { hasRole } from '@bk2/shared/util';

import { AvatarService } from '@bk2/avatar/data-access';
import { getDocumentStoragePath } from '@bk2/document/util';

import { GroupEditStore } from './group-edit.store';
import { convertGroupToForm } from '@bk2/group/util';
import { ContentComponent } from '@bk2/cms/page/feature';
import { MembersComponent } from '@bk2/membership/feature';
import { TranslatePipe } from '@bk2/shared/i18n';
import { AsyncPipe } from '@angular/common';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { GroupMenuComponent } from '@bk2/cms/menu/ui';
import { SimpleTaskListComponent } from '@bk2/task/feature';
import { newAvatarModel, readAsFile } from '@bk2/avatar/util';

@Component({
  selector: 'bk-group-view-page',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    ChangeConfirmationComponent, ContentComponent, MembersComponent, GroupMenuComponent, SimpleTaskListComponent,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonSegmentView, IonSegmentContent, IonToolbar,
    IonHeader, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover
  ],
  providers: [GroupEditStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ name() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [id]="id()">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover [trigger]="id()" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-group-menu segmentName="{{selectedSegment()}}" [currentUser]="currentUser()" />
                </ion-content>
              </ng-template>
            </ion-popover>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
      <ion-segment [scrollable]="true" color="secondary" (ionChange)="onSegmentChanged($event)" value="content">
        @if(hasContent()) {
          <ion-segment-button value="content" content-id="content">
            <ion-label>{{ '@subject.group.segment.content' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasChat()) {
          <ion-segment-button value="chat" content-id="chat">
            <ion-label>{{ '@subject.group.segment.chat' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasCalendar()) {
          <ion-segment-button value="calendar" content-id="calendar">
            <ion-label>{{ '@subject.group.segment.calendar' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasTasks()) {
          <ion-segment-button value="tasks" content-id="tasks">
            <ion-label>{{ '@subject.group.segment.tasks' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasFiles()) {
          <ion-segment-button value="files" content-id="files">
            <ion-label>{{ '@subject.group.segment.files' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasAlbum()) {
          <ion-segment-button value="album" content-id="album">
            <ion-label>{{ '@subject.group.segment.album' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasMembers()) {
          <ion-segment-button value="members" content-id="members">
            <ion-label>{{ '@subject.group.segment.members' | translate | async}}</ion-label>
          </ion-segment-button>
        }
      </ion-segment>
      </ion-toolbar>
    </ion-header>
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <ion-segment-view>
        @if(hasContent()) {
          <ion-segment-content id="content">
            <bk-content id="{{id() + '_content'}}" />
          </ion-segment-content>
        }
        @if(hasChat()) {
          <ion-segment-content id="chat">
            <bk-content id="{{id() + '_chat'}}" />
          </ion-segment-content>
        }
        @if(hasCalendar()) {
          <ion-segment-content id="calendar">
            <bk-content id="{{id() + '_calendar'}}" />
          </ion-segment-content>
        }
        @if(hasTasks()) {
          <ion-segment-content id="tasks">
            <bk-simple-task-list listId="{{id()}}" />
          </ion-segment-content>
        }
        @if(hasFiles()) {
          <ion-segment-content id="files">
            <bk-content id="{{id() + '_files'}}" />
          </ion-segment-content>
        }
        @if(hasAlbum()) {
          <ion-segment-content id="album">
            <bk-content id="{{id() + '_album'}}" />
          </ion-segment-content>
        }
        @if(hasMembers()) {
          <ion-segment-content id="members">
            <bk-members [orgKey]="groupKey()" />
          </ion-segment-content>
        }
      </ion-segment-view>
    </ion-content>
  `
})
export class GroupViewPageComponent {
  private readonly avatarService = inject(AvatarService);
  private readonly groupEditStore = inject(GroupEditStore);
  private readonly uploadService = inject(UploadService);
  private readonly platform = inject(Platform);
  private readonly env = inject(ENV);

  public groupKey = input.required<string>();

  protected currentUser = computed(() => this.groupEditStore.currentUser());
  protected selectedSegment = computed(() => this.groupEditStore.segment());
  protected group = computed(() => this.groupEditStore.group());
  protected name = computed(() => this.vm().name ?? '');
  protected id = computed(() => this.vm().id ?? '');
  protected hasContent = computed(() => this.vm().hasContent ?? true);
  protected hasChat = computed(() => this.vm().hasChat ?? true);
  protected hasCalendar = computed(() => this.vm().hasCalendar ?? true);
  protected hasTasks = computed(() => this.vm().hasTasks ?? true);
  protected hasFiles = computed(() => this.vm().hasFiles ?? true);
  protected hasAlbum = computed(() => this.vm().hasAlbum ?? true);
  protected hasMembers = computed(() => this.vm().hasMembers ?? true);

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

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    console.log(`GroupViewPageComponent.onPopoverDismiss: ${_selectedMethod}`);
/*     switch(_selectedMethod) {
      case 'add':  await this.calEventListStore.add(); break;
      case 'exportRaw': await this.calEventListStore.export("raw"); break;
      default: error(undefined, `YearlyEventListComponent.call: unknown method ${_selectedMethod}`);
    } */
  }

  onSegmentChanged($event: CustomEvent): void {
    const _selectedSegment = $event.detail.value;
    this.groupEditStore.setSelectedSegment(_selectedSegment);
  }
}
