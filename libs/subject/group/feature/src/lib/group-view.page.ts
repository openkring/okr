import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonButtons, IonContent, IonHeader, IonLabel, IonSpinner, IonMenuButton, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModel, GroupModelName, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent } from '@bk2/shared-ui';
import { error } from '@bk2/shared-util-angular';
import { coerceBoolean, debugData, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_ID, DEFAULT_NAME } from '@bk2/shared-constants';

import { ContentPageComponent } from '@bk2/cms-page-feature';
import { getDocumentStoragePath } from '@bk2/document-util';
import { MembershipListComponent } from '@bk2/relationship-membership-feature';
import { SimpleTaskListComponent } from '@bk2/task-feature';

import { GroupStore } from './group.store';
import { CalEventListComponent } from '@bk2/calevent-feature';

@Component({
  selector: 'bk-group-view-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    ChangeConfirmationComponent, ContentPageComponent, SimpleTaskListComponent,
    CalEventListComponent, MembershipListComponent,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonToolbar, IonSpinner,
    IonHeader, IonButtons, IonTitle, IonMenuButton
  ],
  providers: [GroupStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ name() }}</ion-title>
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
        <!--
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
        -->
        @if(hasMembers()) {
          <ion-segment-button value="members">
            <ion-label>{{ '@subject.group.segment.members' | translate | async}}</ion-label>
          </ion-segment-button>
        }
      </ion-segment>
      </ion-toolbar>
    </ion-header>
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(id(); as id) {
        @switch (selectedSegment()) {
          @case ('content') {
            @defer (on immediate) {
              <bk-content-page id="{{id + '_content'}}" contextMenuName="c-contentpage" color="light" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('chat') {
            @defer (on immediate) {
              <bk-content-page id="{{id + '_chat'}}" contextMenuName="c-contentpage" color="light" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('calendar') {
            @defer (on immediate) {
              <bk-calevent-list [listId]="id" contextMenuName="c-calevents" color="light" view="calendar" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('tasks') {
            @defer (on immediate) {
              <bk-simple-task-list [listId]="id" contextMenuName="c-test-simpletasklist" color="light" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          <!--
          @case ('files') {
            @defer (on immediate) {
              <bk-content-page id="{{id + '_files'}}" contextMenuName="c-test-contentpage" color="light" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('album') {
            @defer (on immediate) {
              <bk-content-page id="{{id + '_album'}}" contextMenuName="c-test-contentpage" color="light" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
        -->
          @case ('members') {
            @defer (on immediate) {
              <bk-membership-list listId="persons" [orgId]="id" [group]="group()" contextMenuName="c-membership" color="light" view="simple" />
              <!-- <bk-members [orgKey]="groupKey()" [readOnly]="isReadOnly()" /> -->
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
        }
      }
    </ion-content>
  `
})
export class GroupViewPageComponent {
  private readonly groupStore = inject(GroupStore);

  // inputs
  public groupKey = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => structuredClone(this.group()));
  protected showForm = signal(true);

  // derived signals and fields
  protected readonly avatarTitle = computed(() => this.name() ?? DEFAULT_NAME);
  protected readonly parentKey = computed(() => `${GroupModelName}.${this.groupKey()}`);
  protected currentUser = computed(() => this.groupStore.currentUser());
  protected selectedSegment = computed(() => this.groupStore.segment());
  protected group = computed(() => this.groupStore.group());
  protected name = computed(() => this.formData()?.name ?? DEFAULT_NAME);
  protected id = computed(() => this.formData()?.bkey ?? DEFAULT_ID);
  protected hasContent = computed(() => this.formData()?.hasContent ?? true);
  protected hasChat = computed(() => this.formData()?.hasChat ?? true);
  protected hasCalendar = computed(() => this.formData()?.hasCalendar ?? true);
  protected hasTasks = computed(() => this.formData()?.hasTasks ?? true);
  //protected hasFiles = computed(() => this.formData()?.hasFiles ?? true);
  //protected hasAlbum = computed(() => this.formData()?.hasAlbum ?? true);
  protected hasMembers = computed(() => this.formData()?.hasMembers ?? true);
  protected path = computed(() => getDocumentStoragePath(this.groupStore.tenantId(), 'group', this.group()?.bkey));
  protected groupTags = computed(() => this.groupStore.getTags());

  constructor() {
    effect(() => {
      console.log(`GroupViewPageComponent: loading group ${this.groupKey()}`);
      this.groupStore.setGroupKey(this.groupKey());
    });
  }

  /******************************* actions *************************************** */
  protected async save(): Promise<void> {
    await this.groupStore.save(this.formData());
  }

  protected async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.group()));  // reset the form
      // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: GroupModel): void {
    this.formData.set(formData);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  protected async onImageSelected(photo: Photo): Promise<void> {
    await this.groupStore.saveAvatar(photo);    
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    debugData(`GroupViewPageComponent.onPopoverDismiss: ${selectedMethod}`, $event, this.groupStore.currentUser());
     switch(selectedMethod) {
      case 'addSection': this.groupStore.addSection(); break;
      case 'selectSection': this.groupStore.selectSection(); break;
      case 'sortSections': this.groupStore.sortSections(); break;
      case 'editSection': this.groupStore.editSection(); break;
      case 'addEvent': this.groupStore.addEvent(); break;
      case 'addTask': this.groupStore.addTask(); break;
      case 'addMember': this.groupStore.addMember(); break;
      default: error(undefined, `GroupViewPage: context menu ${this.selectedSegment()} has unknown action: ${selectedMethod}`); break;
    } 
  }

  protected onSegmentChanged($event: CustomEvent): void {
    const selectedSegment = $event.detail.value;
    this.groupStore.setSelectedSegment(selectedSegment);
  }

  protected hasMenu(segmentName?: string): boolean {
    if (!segmentName) return false;
    return (segmentName === 'content' || segmentName === 'calendar' || segmentName === 'tasks' || segmentName === 'members');
  }
}
