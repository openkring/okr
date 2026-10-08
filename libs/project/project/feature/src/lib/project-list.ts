import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon,
  IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { DEFAULT_PROJECT_STATE } from '@okr/shared-constants';
import { AvatarPipe } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import { ProjectModel } from '@okr/shared-models';
import { TranslatePipe } from '@okr/shared-i18n';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@okr/shared-util-angular';

import { PROJECT_I18N_SCOPE } from '@okr/project-project-util';
import { ProjectStore } from './project.store';

/**
 * All (non-archived) projects of the tenant, newest start first. Actions: *add* in the context
 * menu; open / edit / duplicate / delete per row through the ActionSheet. Staff only (the route
 * carries isPrivilegedGuard).
 */
@Component({
  selector: 'okr-project-list',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, PrettyDatePipe, AvatarPipe,
    Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonAvatar, IonImg, IonChip, IonPopover
  ],
  providers: [ProjectStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; }
    ion-chip { font-size: 0.75rem; height: 22px; }
    .name { min-width: 50% !important; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ store.projectsCount() }} {{ store.i18n.plural() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [id]="popupId()">
            <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover [trigger]="popupId()" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content><okr-menu [menuName]="contextMenuName()" /></ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>

      <okr-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        (tagChanged)="store.setSelectedTag($event)" [tags]="store.tags()"
        (stateChanged)="store.setSelectedState($event)" [states]="store.states()"
      />
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (project of store.filteredProjects(); track project.okey) {
            <ion-item button [detail]="false" (click)="showActions(project)">
              @if (project.projectManager) {
                <ion-avatar slot="start">
                  <ion-img src="{{ project.projectManager.modelType + '.' + project.projectManager.key | avatar }}" alt="" />
                </ion-avatar>
              }
              <ion-label class="name">{{ project.name }}</ion-label>
              @if (project.startDate) {
                <ion-label class="ion-hide-md-down ion-text-end">
                  {{ project.startDate | prettyDate }}@if (project.endDate) { – {{ project.endDate | prettyDate }} }
                </ion-label>
              }
              <ion-chip slot="end" color="primary">{{ stateKey(project) | translate | async }}</ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class ProjectList {
  protected readonly store = inject(ProjectStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly router = inject(Router);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly listId = input.required<string>();
  public readonly contextMenuName = input.required<string>();

  constructor() {
    this.store.enableList();
  }

  protected readonly filteredCount = computed(() => this.store.filteredProjects().length);
  protected readonly popupId = computed(() => `c_projects_${this.listId()}`);

  protected stateKey(project: ProjectModel): string {
    return `${PROJECT_I18N_SCOPE}.project_state.${(project.state ?? DEFAULT_PROJECT_STATE)}.label`;
  }

  /*-------------------------- context menu --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const method = $event.detail.data;
    if (!method) return; // dismissed without choosing an item (backdrop/escape)
    switch (method) {
      case 'add': await this.store.add(); break;
      default: error(undefined, `ProjectList.onPopoverDismiss: unknown method ${method}`);
    }
  }

  /*-------------------------- row actions --------------------------------*/
  protected async showActions(project: ProjectModel): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.title());
    options.buttons.push(createActionSheetButton('project.open', this.store.i18n.open(), this.imgixBaseUrl, 'eye-on'));
    options.buttons.push(createActionSheetButton('project.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('project.duplicate', this.store.i18n.duplicate(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('project.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'project.open': await this.router.navigate(['/projects', project.okey]); break;
      case 'project.edit': await this.store.edit(project); break;
      case 'project.duplicate': await this.store.duplicate(project); break;
      case 'project.delete': await this.store.delete(project); break;
    }
  }
}
