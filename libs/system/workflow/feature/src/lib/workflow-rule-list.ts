import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { RoleName, WorkflowRuleModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions, keepDefaultTrue } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { getWorkflowRuleSummary } from '@okr/system-workflow-util';

import { WorkflowRuleStore } from './workflow-rule.store';

@Component({
  selector: 'okr-workflow-rule-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, ListFilter, EmptyList, Menu,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonPopover
  ],
  providers: [WorkflowRuleStore],
  template: `
    <ion-header>
      @if(contextMenuName() !== 'disable') {
        <ion-toolbar color="secondary">
          @if(showMenuButton()) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ filteredRulesCount() }}/{{ rulesCount() }} {{ store.i18n.plural() }}</ion-title>
          @if(!readOnly()) {
            <ion-buttons slot="end">
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
                <ng-template>
                  <ion-content>
                    <okr-menu [menuName]="contextMenuName()" />
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>
          }
        </ion-toolbar>
      }
      <okr-list-filter (searchTermChanged)="onSearchTermChange($event)" />
    </ion-header>

    <ion-content>
      @if(isLoading()) {
        <okr-spinner />
      } @else {
        @if(filteredRulesCount() === 0) {
          <okr-empty-list [message]="store.i18n.empty()" />
        } @else {
          <ion-list>
            @for(rule of filteredRules(); track rule.okey) {
              <ion-item (click)="showActions(rule)">
                <ion-icon slot="start" src="{{ 'settings' | svgIcon }}" />
                <ion-label>
                  <h3>{{ rule.name }}</h3>
                  <p>{{ summary(rule) }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class WorkflowRuleList {
  protected readonly store = inject(WorkflowRuleStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs
  public readonly contextMenuName = input.required<string>();
  public readonly listId = input('all');
  // keepDefaultTrue: withComponentInputBinding() would otherwise set this to undefined on standalone
  // routes (the route only binds listId/contextMenuName), which hides the main-menu hamburger.
  public showMenuButton = input(true, { transform: keepDefaultTrue });

  // data
  protected readonly filteredRules = computed(() => this.store.filteredRules());
  protected readonly rulesCount = computed(() => this.store.rules().length);
  protected readonly filteredRulesCount = computed(() => this.filteredRules().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly currentUser = computed(() => this.store.currentUser());
  // a rule decides who gets told about a membership event — admin-only, like its rules
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));
  protected readonly popupId = computed(() => `c_workflow_rules_list`);

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** setters ******************************************* */
  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  /******************************* actions *************************************** */
  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape)
    switch (selectedMethod) {
      case 'add': await this.store.add(); break;
      case 'exportRaw': await this.store.export(); break;
      default: this.alertService.error(`WorkflowRuleList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(rule: WorkflowRuleModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    actionSheetOptions.buttons.push(createActionSheetButton('rule.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('rule.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    }

    const actionSheet = await this.actionSheetController.create(actionSheetOptions);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'rule.edit': await this.store.edit(rule, this.readOnly()); break;
      case 'rule.delete': await this.store.delete(rule); break;
    }
  }

  /******************************* helpers *************************************** */
  protected summary(rule: WorkflowRuleModel): string {
    return getWorkflowRuleSummary(rule, (key) => this.store.responsibilityName(key));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
