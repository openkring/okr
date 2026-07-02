import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonLabel, IonSpinner, IonMenuButton, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ViewWillEnter } from '@ionic/angular';

import { ChangeConfirmation, ChangeConfirmationI18n } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { isAdminMember } from '@okr/subject-group-util';
import { DEFAULT_ID, DEFAULT_NAME } from '@okr/shared-constants';

import { PageDispatcher, PageStore } from '@okr/cms-page-feature';
import { getDocumentStoragePath } from '@okr/document-util';
import { FolderService } from '@okr/folder-data-access';
import { MembershipList } from '@okr/relationship-membership-feature';
import { TaskList } from '@okr/task-feature';
import { DocumentList } from '@okr/document-feature';
import { CalEventList } from '@okr/calevent-feature';

import { GroupStore } from './group.store';

@Component({
  selector: 'okr-group-view-page',
  standalone: true,
  imports: [
    ChangeConfirmation, PageDispatcher, CalEventList, MembershipList, DocumentList, TaskList,
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
            <ion-label>{{ store.i18n.segment_content() }}</ion-label>
          </ion-segment-button>
        }
        @if(hasChat()) {
          <ion-segment-button value="chat">
            <ion-label>{{ store.i18n.segment_chat() }}</ion-label>
          </ion-segment-button>
        }
        @if(hasCalendar()) {
          <ion-segment-button value="calendar">
            <ion-label>{{ store.i18n.segment_calendar() }}</ion-label>
          </ion-segment-button>
        }
        @if(hasTasks()) {
          <ion-segment-button value="tasks">
            <ion-label>{{ store.i18n.segment_tasks() }}</ion-label>
          </ion-segment-button>
        }
        @if(hasFiles()) {
          <ion-segment-button value="files">
            <ion-label>{{ store.i18n.segment_files() }}</ion-label>
          </ion-segment-button>
        }
        @if(hasAlbum()) {
          <ion-segment-button value="album">
            <ion-label>{{ store.i18n.segment_album() }}</ion-label>
          </ion-segment-button>
        }
        @if(hasMembers()) {
          <ion-segment-button value="members">
            <ion-label>{{ store.i18n.segment_members() }}</ion-label>
          </ion-segment-button>
        }
      </ion-segment>
      </ion-toolbar>
    </ion-header>
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(id(); as id) {
        @if(id.length > 0) {
        @switch (selectedSegment()) {
          @case ('content') {
            @defer (on immediate) {
              <okr-page-dispatcher id="{{id + '_content'}}" contextMenuName="c-contentpage" [color]="color()" [isGroupView]="true" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('chat') {
            @defer (on immediate) {
              <okr-page-dispatcher id="{{id + '_chat'}}" contextMenuName="c-contentpage" [color]="color()" [isGroupView]="true" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('calendar') {
            @defer (on immediate) {
              <okr-calevent-list [listId]="id" contextMenuName="c-calevents" color="light" view="grid" [showMenuButton]="false" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('tasks') {
            @defer (on immediate) {
               <okr-task-list [listId]="id" contextMenuName="c-tasks" color="light" view="group" [showMenuButton]="false" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('files') {
            @defer (on immediate) {
              <okr-document-list [listId]="listId()" contextMenuName="c-folder" color="light" [showMenuButton]="false" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('album') {
            @defer (on immediate) {
              <okr-document-list [listId]="albumId()" contextMenuName="c-folder" color="light" [showMenuButton]="false" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
          @case ('members') {
            @defer (on immediate) {
              <okr-membership-list listId="persons" [orgId]="id" [group]="group()" contextMenuName="c-groupmembers" color="light" view="group" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            }
          }
        }
      }
    }
    </ion-content>
  `
})
export class GroupViewPage implements ViewWillEnter {
  protected readonly store = inject(GroupStore);
  private readonly pageStore = inject(PageStore);
  private readonly folderService = inject(FolderService);

  // inputs
  public groupKey = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.group()));
  protected showForm = signal(true);

  // derived signals and fields
  protected readonly avatarTitle = computed(() => this.name() ?? DEFAULT_NAME);
  protected readonly listId = computed(() => `f:${this.groupKey()}`);
  protected readonly albumId = computed(() => `f:a_${this.groupKey()}`);
  protected currentUser = computed(() => this.store.currentUser());
  protected isGroupAdmin = computed(() => isAdminMember(this.group(), this.currentUser()?.personKey));
  protected selectedSegment = computed(() => this.store.segment());
  protected group = computed(() => this.store.group());
  protected name = computed(() => this.formData()?.name ?? DEFAULT_NAME);
  protected id = computed(() => this.formData()?.okey ?? DEFAULT_ID);
  protected hasContent = computed(() => this.formData()?.hasContent ?? true);
  protected hasChat = computed(() => this.formData()?.hasChat ?? true);
  protected hasCalendar = computed(() => this.formData()?.hasCalendar ?? true);
  protected hasTasks = computed(() => this.formData()?.hasTasks ?? true);
  protected hasFiles = computed(() => this.formData()?.hasFiles ?? true);
  protected hasAlbum = computed(() => this.formData()?.hasAlbum ?? true);
  protected hasMembers = computed(() => this.formData()?.hasMembers ?? true);
  protected path = computed(() => getDocumentStoragePath(this.store.tenantId(), 'group', this.group()?.okey));
  protected groupTags = computed(() => this.store.getTags());
  protected color = computed(() => this.id().startsWith('notfall') ? 'danger' : 'light');
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  constructor() {
    effect(() => {
      this.store.setGroupKey(this.groupKey());
    });
  }

  // Fires when Ionic restores this view from its cache (back navigation).
  // PageDispatcher is an embedded child — it doesn't receive ionViewWillEnter —
  // so we must reset pageId here to prevent the cached view from showing stale content.
  ionViewWillEnter(): void {
    const groupId = this.id();
    const segment = this.selectedSegment();
    if ((segment === 'content' || segment === 'chat') && groupId && groupId !== DEFAULT_ID) {
      this.pageStore.setPageId(`${groupId}_${segment}`);
    }
  }

  /******************************* actions *************************************** */
  protected async save(): Promise<void> {
    await this.store.save(this.formData());
  }

  protected async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.group()));  // reset the form
      // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  /******************************* helpers *************************************** */
  protected async onSegmentChanged($event: CustomEvent): Promise<void> {
    const selectedSegment = $event.detail.value;
    this.store.setSelectedSegment(selectedSegment);
    if (selectedSegment === 'files') {
      await this.folderService.ensureGroupFolder(
        this.groupKey(), this.name(), this.store.tenantId(), this.currentUser()
      );
    }
  }
}
