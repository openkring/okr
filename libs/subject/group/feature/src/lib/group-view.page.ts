import { Component, computed, effect, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPopover, IonSpinner, IonMenuButton, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ViewWillEnter } from '@ionic/angular';

import { GroupModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, DeferError } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { safeStructuredClone } from '@okr/shared-util-core';
import { isAdminMember } from '@okr/subject-group-util';
import { canManageFolders } from '@okr/content-folder-util';
import { DEFAULT_ID, DEFAULT_NAME } from '@okr/shared-constants';

import { Menu } from '@okr/cms-menu-feature';
import { PageDispatcher, PageStore } from '@okr/cms-page-feature';
import { getDocumentStoragePath } from '@okr/content-document-util';
import { FolderService } from '@okr/content-folder-data-access';
import { MembershipList } from '@okr/relationship-membership-feature';
import { TaskList } from '@okr/task-feature';
import { DocumentList } from '@okr/content-document-feature';
import { CalEventList } from '@okr/calevent-feature';

import { GroupStore } from './group.store';

@Component({
  selector: 'okr-group-view-page',
  standalone: true,
  imports: [
    ChangeConfirmation, DeferError, PageDispatcher, CalEventList, MembershipList, DocumentList, TaskList,
    Menu, SvgIconPipe,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonToolbar, IonSpinner,
    IonHeader, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon, IonPopover, IonItem
],
  providers: [GroupStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ name() }}</ion-title>
        <ion-buttons slot="end">
          <!-- view toggle of the selected segment, hoisted from the segment toolbar -->
          @if(segmentHasViewToggle()) {
            <ion-button (click)="toggleSegmentView()">
              <ion-icon slot="icon-only" src="{{ viewToggleIcon() | svgIcon }}" />
            </ion-button>
          }
          <!-- info (help) icon of the chat segment, hoisted left of the context menu -->
          @if(showSegmentInfo()) {
            <ion-button (click)="openSegmentInfo()">
              <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
            </ion-button>
          }
          <!-- context menu of the selected segment, hoisted from the segment toolbar -->
          @if(showSegmentContextMenu()) {
            <ion-button [id]="segmentPopupId">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover [trigger]="segmentPopupId" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onSegmentPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="segmentContextMenuName()!" [forceVisible]="isGroupAdmin()" [toggleStates]="segmentToggleStates()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
      <ion-segment [scrollable]="true" color="secondary" (ionChange)="onSegmentChanged($event)" [value]="selectedSegment()">
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
            } @error {
              <okr-defer-error />
            }
          }
          @case ('chat') {
            @defer (on immediate) {
              <okr-page-dispatcher id="{{id + '_chat'}}" [color]="color()" [isGroupView]="true" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            } @error {
              <okr-defer-error />
            }
          }
          @case ('calendar') {
            @defer (on immediate) {
              <okr-calevent-list [listId]="id" contextMenuName="disable" color="light" view="grid" [showMenuButton]="false" [showViewToggle]="false" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            } @error {
              <okr-defer-error />
            }
          }
          @case ('tasks') {
            @defer (on immediate) {
               <okr-task-list [listId]="id" contextMenuName="c-tasks" color="light" view="group" [showMenuButton]="false" [showContextMenu]="false" [showViewToggle]="false" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            } @error {
              <okr-defer-error />
            }
          }
          @case ('files') {
            @if(folderConflict()) {
              <ion-item lines="none" color="danger">
                <ion-label class="ion-text-wrap">{{ store.i18n.files_conflict() }}</ion-label>
              </ion-item>
            } @else {
              @defer (on immediate) {
                <okr-document-list [listId]="listId()" contextMenuName="disable" color="light" view="grid" [showMenuButton]="false" [groupAdmin]="isGroupAdmin()" />
              } @placeholder {
                <div class="placeholder-center"><ion-spinner /></div>
              } @error {
                <okr-defer-error />
              }
            }
          }
          @case ('members') {
            @defer (on immediate) {
              <okr-membership-list listId="persons" [orgId]="id" [group]="group()" contextMenuName="c-groupmembers" color="light" view="group" [showContextMenu]="false" [groupAdmin]="isGroupAdmin()" />
            } @placeholder {
              <div class="placeholder-center"><ion-spinner /></div>
            } @error {
              <okr-defer-error />
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

 // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  // Set when ensureGroupFolder refuses the group's well-known folder key because it is
  // already owned by someone outside the group's admins (folder-ID squatting guard,
  // spec 1.22). While set, the files segment shows a notice instead of the document list.
  protected folderConflict = signal(false);
  // Retain the last loaded group while group() transiently reloads to undefined
  // (auth/token refresh, Safari long-poll reconnect). Otherwise formData → undefined →
  // id() === '' collapses the @if and DESTROYS the segment content (e.g. the document
  // list), which resets folder navigation back to the top view on every reconnect.
  public formData = linkedSignal<GroupModel | undefined, GroupModel | undefined>({
    source: () => this.group(),
    computation: (group, previous) => group ? safeStructuredClone(group) : previous?.value,
  });
  protected showForm = signal(true);

  // derived signals and fields
  protected readonly avatarTitle = computed(() => this.name() ?? DEFAULT_NAME);
  protected readonly listId = computed(() => `f:${this.groupKey()}`);
  protected currentUser = computed(() => this.store.currentUser());
  protected isGroupAdmin = computed(() => isAdminMember(this.group(), this.currentUser()?.personKey));
  // Effective segment: the user's explicit choice, else the first enabled segment by priority.
  protected selectedSegment = computed(() => this.store.segment() ?? this.defaultSegment());
  protected group = computed(() => this.store.group());
  protected name = computed(() => this.formData()?.name ?? DEFAULT_NAME);
  protected id = computed(() => this.formData()?.okey ?? DEFAULT_ID);
  protected hasContent = computed(() => this.formData()?.hasContent ?? true);
  protected hasChat = computed(() => this.formData()?.hasChat ?? true);
  protected hasCalendar = computed(() => this.formData()?.hasCalendar ?? true);
  protected hasTasks = computed(() => this.formData()?.hasTasks ?? true);
  protected hasFiles = computed(() => this.formData()?.hasFiles ?? true);
  protected hasMembers = computed(() => this.formData()?.hasMembers ?? true);
  // First enabled segment in priority order: content > chat > todos(tasks) > members, then calendar/files as fallback.
  protected readonly defaultSegment = computed(() => {
    const ordered: ReadonlyArray<readonly [boolean, string]> = [
      [this.hasContent(), 'content'],
      [this.hasChat(), 'chat'],
      [this.hasTasks(), 'tasks'],
      [this.hasMembers(), 'members'],
      [this.hasCalendar(), 'calendar'],
      [this.hasFiles(), 'files'],
    ];
    return ordered.find(([enabled]) => enabled)?.[1] ?? 'content';
  });
  protected path = computed(() => getDocumentStoragePath(this.store.tenantId(), 'group', this.group()?.okey));
  protected groupTags = computed(() => this.store.getTags());
  protected color = computed(() => this.id().startsWith('notfall') ? 'danger' : 'light');
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  /* ---- hoisted segment toolbar (context menu + view toggle) ----
   * Each segment renders its own context menu / view toggle inside its own toolbar; in the group we
   * suppress that toolbar (via showContextMenu/showViewToggle/contextMenuName="disable") and render a
   * single context-menu + view-toggle in the group toolbar, delegating the action to the active segment
   * component queried below. content/chat go through PageDispatcher (menu lives inside the CMS page). */
  private readonly caleventList = viewChild(CalEventList);
  private readonly taskList = viewChild(TaskList);
  private readonly documentList = viewChild(DocumentList);
  private readonly membershipList = viewChild(MembershipList);
  // content/chat render through the PageDispatcher; it exposes a hoist facade we delegate to.
  private readonly pageDispatcher = viewChild(PageDispatcher);

  protected readonly segmentPopupId = 'group-segment-menu';

  // Context menu name of the selected segment.
  protected readonly segmentContextMenuName = computed<string | undefined>(() => {
    switch (this.selectedSegment()) {
      case 'calendar': return 'c-calevents';
      case 'tasks': return 'c-tasks';
      case 'files': return 'c-folder';
      case 'members': return 'c-groupmembers';
      case 'content':
      case 'chat': return this.pageDispatcher()?.hoistMenuName();
      default: return undefined;
    }
  });

  // Show the hoisted context-menu button only when the active segment permits changes.
  protected readonly showSegmentContextMenu = computed(() => {
    if (!this.segmentContextMenuName()) return false;
    switch (this.selectedSegment()) {
      case 'calendar': return this.caleventList()?.canChange() ?? false;
      case 'tasks': return this.taskList()?.canChange() ?? false;
      case 'files': return this.documentList()?.canChange() ?? false;
      case 'members': return this.membershipList()?.canChange() ?? false;
      case 'content':
      case 'chat': return this.pageDispatcher()?.showHoistMenu() ?? false;
      default: return false;
    }
  });

  // Chat exposes an info (help) icon, hoisted left of the context menu.
  protected readonly showSegmentInfo = computed(() => this.pageDispatcher()?.showHoistInfo() ?? false);

  // State of any 'toggle' menu items in the hoisted context menu (e.g. the files filter show/hide).
  protected readonly segmentToggleStates = computed<Record<string, boolean>>(() => {
    const states: Record<string, boolean> = {};
    switch (this.selectedSegment()) {
      case 'files':
        states['toggleFilter'] = this.documentList()?.isFilterVisible() ?? false;
        states['toggleEditMode'] = this.documentList()?.isEditMode() ?? false;
        break;
      case 'tasks':
        states['toggleFilter'] = this.taskList()?.isFilterVisible() ?? false;
        break;
      case 'calendar':
        states['toggleFilter'] = this.caleventList()?.isFilterVisible() ?? false;
        break;
      case 'content':
        states['toggleEditMode'] = this.pageDispatcher()?.contentEditActive() ?? false;
        break;
    }
    return states;
  });

  // Only calendar/tasks/files expose a list/alternative view toggle.
  protected readonly segmentHasViewToggle = computed(() => {
    const seg = this.selectedSegment();
    return seg === 'calendar' || seg === 'tasks' || seg === 'files';
  });

  protected readonly viewToggleIcon = computed(() => {
    const seg = this.selectedSegment();
    let isListView = true;
    switch (seg) {
      case 'calendar': isListView = this.caleventList()?.isListView() ?? true; break;
      case 'tasks': isListView = this.taskList()?.isListView() ?? true; break;
      case 'files': isListView = this.documentList()?.isListView() ?? true; break;
    }
    if (!isListView) return 'list'; // already in the alternative view → offer to go back to list
    switch (seg) {
      case 'calendar': return 'calendar';
      case 'tasks': return 'grid';
      case 'files': return 'grid';
      default: return 'list';
    }
  });

  protected toggleSegmentView(): void {
    switch (this.selectedSegment()) {
      case 'calendar': this.caleventList()?.toggleView(); break;
      case 'tasks': this.taskList()?.toggleView(); break;
      case 'files': this.documentList()?.toggleView(); break;
    }
  }

  protected async onSegmentPopoverDismiss($event: CustomEvent): Promise<void> {
    switch (this.selectedSegment()) {
      case 'calendar': await this.caleventList()?.onPopoverDismiss($event); break;
      case 'tasks': await this.taskList()?.onPopoverDismiss($event); break;
      case 'files': await this.documentList()?.onPopoverDismiss($event); break;
      case 'members': await this.membershipList()?.onPopoverDismiss($event); break;
      case 'content':
      case 'chat': await this.pageDispatcher()?.onHoistMenuDismiss($event); break;
    }
  }

  protected async openSegmentInfo(): Promise<void> {
    await this.pageDispatcher()?.openHoistInfo();
  }

  constructor() {
    effect(() => {
      this.store.setGroupKey(this.groupKey());
      // The component instance is reused across a groupKey param change (ionViewWillEnter
      // below relies on that too), so a stale folder-adoption-guard notice from the
      // previous group must not leak into the next one — clear it here, before any check
      // for the new group has run.
      this.folderConflict.set(false);
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
    // Only folder-managers may (implicitly) create the group folder — members opening
    // the files tab before it exists just see an empty list (spec 1.22).
    if (selectedSegment === 'files' && canManageFolders(this.currentUser(), this.isGroupAdmin())) {
      const targetGroupKey = this.groupKey();
      // Prefer the retained formData mirror over group() — group() transiently reloads to
      // undefined (auth/token refresh, Safari long-poll reconnect; see the linkedSignal
      // comment above). But that linkedSignal retains the *previous* group's record across
      // ANY blip, including a groupKey change itself (switching groups also makes group()
      // reload through undefined) — so only trust the candidate when its own okey actually
      // matches the group we're checking; otherwise treat it as unresolved (same as the
      // group()-undefined case) and skip, rather than validating against the wrong group's
      // admin list. An empty allowedOwnerKeys array is the adoption guard's "disable the
      // guard" sentinel, so this must not run with a stale or absent record.
      const candidateGroup = this.formData() ?? this.group();
      const currentGroup = candidateGroup?.okey === targetGroupKey ? candidateGroup : undefined;
      if (currentGroup) {
        const allowedOwnerKeys = (currentGroup.admins ?? []).map(admin => admin.key);
        const isUsable = await this.folderService.ensureGroupFolder(
          targetGroupKey, currentGroup.name, this.store.tenantId(), this.currentUser(), allowedOwnerKeys
        );
        // The awaited call may resolve after the user has navigated to a different group —
        // only apply the result if it's still the group currently on screen.
        if (this.groupKey() === targetGroupKey) {
          this.folderConflict.set(!isUsable);
        }
      }
    }
  }
}
