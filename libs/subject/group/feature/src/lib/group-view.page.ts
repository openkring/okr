import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonSpinner, IonMenuButton, IonPopover, IonSegment, IonSegmentButton, IonTitle, IonToolbar, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupCollection, ModelType, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ChangeConfirmationComponent, UploadService } from '@bk2/shared-ui';
import { error } from '@bk2/shared-util-angular';
import { debugData, hasRole } from '@bk2/shared-util-core';

import { AvatarService } from '@bk2/avatar-data-access';
import { newAvatarModel, readAsFile } from '@bk2/avatar-util';
import { GroupMenuComponent } from '@bk2/cms-menu-ui';
import { ContentComponent } from '@bk2/cms-page-feature';
import { getDocumentStoragePath } from '@bk2/document-util';
import { MembersComponent } from '@bk2/relationship-membership-feature';
import { SimpleTaskListComponent } from '@bk2/task-feature';

import { convertGroupToForm } from '@bk2/subject-group-util';

import { GroupEditStore } from './group-edit.store';

@Component({
  selector: 'bk-group-view-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    ChangeConfirmationComponent, ContentComponent, MembersComponent, GroupMenuComponent, SimpleTaskListComponent,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonToolbar, IonSpinner,
    IonHeader, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover
  ],
  providers: [GroupEditStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ name() }}</ion-title>
        @if(hasMenu(selectedSegment())) {
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
        }
      </ion-toolbar>
      <ion-toolbar>
      <ion-segment [scrollable]="true" color="secondary" (ionChange)="onSegmentChanged($event)" value="content">
        @if(hasContent()) {
          <ion-segment-button value="content">
            <ion-label>{{ '@subject.group.segment.content' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasChat()) {
          <ion-segment-button value="chat">
            <ion-label>{{ '@subject.group.segment.chat' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasCalendar()) {
          <ion-segment-button value="calendar">
            <ion-label>{{ '@subject.group.segment.calendar' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasTasks()) {
          <ion-segment-button value="tasks">
            <ion-label>{{ '@subject.group.segment.tasks' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasFiles()) {
          <ion-segment-button value="files">
            <ion-label>{{ '@subject.group.segment.files' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasAlbum()) {
          <ion-segment-button value="album">
            <ion-label>{{ '@subject.group.segment.album' | translate | async}}</ion-label>
          </ion-segment-button>
        }
        @if(hasMembers()) {
          <ion-segment-button value="members">
            <ion-label>{{ '@subject.group.segment.members' | translate | async}}</ion-label>
          </ion-segment-button>
        }
      </ion-segment>
      </ion-toolbar>
    </ion-header>
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content class="ion-padding">
      @switch (selectedSegment()) {
        @case ('content') {
          @defer (on immediate) {
            <bk-content id="{{id() + '_content'}}" />
          } @placeholder {
            <div class="placeholder-center"><ion-spinner /></div>
          }
        }
        @case ('chat') {
          @defer (on immediate) {
            <bk-content id="{{id() + '_chat'}}" />
          } @placeholder {
            <div class="placeholder-center"><ion-spinner /></div>
          }
        }
        @case ('calendar') {
          @defer (on immediate) {
            <bk-content id="{{id() + '_calendar'}}" />
          } @placeholder {
            <div class="placeholder-center"><ion-spinner /></div>
          }
        }
        @case ('tasks') {
          @defer (on immediate) {
            <bk-simple-task-list [listId]="id()" />
          } @placeholder {
            <div class="placeholder-center"><ion-spinner /></div>
          }
        }
        @case ('files') {
          @defer (on immediate) {
            <bk-content id="{{id() + '_files'}}" />
          } @placeholder {
            <div class="placeholder-center"><ion-spinner /></div>
          }
        }
        @case ('album') {
          @defer (on immediate) {
            <bk-content id="{{id() + '_album'}}" />
          } @placeholder {
            <div class="placeholder-center"><ion-spinner /></div>
          }
        }
        @case ('members') {
          @defer (on immediate) {
            <bk-members [orgKey]="groupKey()" />
          } @placeholder {
            <div class="placeholder-center"><ion-spinner /></div>
          }
        }
      }
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
    const group = this.group();
    if (!group) return;
    const file = await readAsFile(photo, this.platform);
    const avatar = newAvatarModel([this.env.tenantId], ModelType.Group, group.bkey, file.name);
    const downloadUrl = await this.uploadService.uploadFile(file, avatar.storagePath, '@document.operation.upload.avatar.title')

    if (downloadUrl) {
      await this.avatarService.updateOrCreate(avatar);
    }
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    debugData(`GroupViewPageComponent.onPopoverDismiss: ${selectedMethod}`, $event, this.groupEditStore.currentUser());
     switch(selectedMethod) {
      case 'addSection': this.groupEditStore.addSection(); break;
      case 'selectSection': this.groupEditStore.selectSection(); break;
      case 'sortSections': this.groupEditStore.sortSections(); break;
      case 'editSection': this.groupEditStore.editSection(); break;
      case 'addEvent': this.groupEditStore.addEvent(); break;
      case 'addTask': this.groupEditStore.addTask(); break;
      case 'addMember': this.groupEditStore.addMember(); break;
      default: error(undefined, `GroupViewPage: context menu ${this.selectedSegment()} has unknown action: ${selectedMethod}`); break;
    } 
  }

  onSegmentChanged($event: CustomEvent): void {
    const selectedSegment = $event.detail.value;
    this.groupEditStore.setSelectedSegment(selectedSegment);
  }

  protected hasMenu(segmentName?: string): boolean {
    if (!segmentName) return false;
    return (segmentName === 'content' || segmentName === 'calendar' || segmentName === 'tasks' || segmentName === 'members');
  }
}
