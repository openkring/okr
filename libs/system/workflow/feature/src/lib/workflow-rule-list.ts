import { Component, computed, inject, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { ActionSheetController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@okr/shared-i18n';
import { RoleName, WorkflowRuleModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions, keepDefaultTrue } from '@okr/shared-util-angular';
import { getItemLabel, hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { getWorkflowRuleActions, getWorkflowRuleCondition, isWorkflowRuleComplete } from '@okr/system-workflow-util';

import { WorkflowRuleStore } from './workflow-rule.store';

@Component({
  selector: 'okr-workflow-rule-list',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    Spinner, ListFilter, EmptyList, Menu,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonItemDivider, IonLabel, IonPopover
  ],
  providers: [WorkflowRuleStore],
  styles: [`
    /* one pill per action step, in execution order — what the rule DOES, next to what triggers it */
    .actions { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 4px; }
    .action {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--ion-color-light-shade);
      color: var(--ion-color-dark);
      font-size: 0.75rem;
    }
    .action-no { font-weight: 600; color: var(--ion-color-secondary); }
    ion-item-divider { --background: var(--ion-color-light); font-size: 0.8rem; }
    .event-key { padding-inline-start: 8px; color: var(--ion-color-medium); font-weight: 400; }
  `],
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
            @for(group of groupedRules(); track group.event) {
              <ion-item-divider sticky="true">
                <ion-label>
                  {{ group.label | translate | async }}<span class="event-key">{{ group.event }}</span>
                </ion-label>
              </ion-item-divider>
              @for(row of group.rules; track row.rule.okey) {
                <ion-item (click)="showActions(row.rule)">
                  <ion-icon slot="start" src="{{ 'settings' | svgIcon }}" />
                  <ion-label>
                    <h3>{{ row.rule.name }}</h3>
                    <p>{{ row.condition }}</p>
                    <div class="actions">
                      @for(action of row.actions; track $index) {
                        <span class="action">
                          <span class="action-no">{{ $index + 1 }}</span>{{ action | translate | async }}
                        </span>
                      }
                    </div>
                  </ion-label>
                  @if(!row.isComplete) {
                    <ion-icon slot="end" color="danger" [title]="store.i18n.steps_incomplete()" src="{{ 'alert-circle' | svgIcon }}" />
                  }
                </ion-item>
              }
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
  // Grouped by event: a rule's one-line summary used to BE its event, which stopped
  // describing it once a rule could carry several actions. The event moves up into the
  // group header, and the row gets the room to show what the rule actually does.
  protected readonly groupedRules = computed(() => {
    const eventCategory = this.store.appStore.getCategory('workflow_event');
    const actionCategory = this.store.appStore.getCategory('workflow_action');
    const groups = new Map<string, WorkflowRuleModel[]>();
    for (const rule of this.filteredRules()) {
      const rules = groups.get(rule.event) ?? [];
      rules.push(rule);
      groups.set(rule.event, rules);
    }
    return [...groups.entries()].map(([event, rules]) => ({
      event,
      label: getItemLabel(eventCategory, event),
      rules: rules.map((rule) => ({
        rule,
        condition: getWorkflowRuleCondition(rule, (key) => this.store.responsibilityName(key)),
        actions: getWorkflowRuleActions(rule).map((action) => getItemLabel(actionCategory, action)),
        isComplete: isWorkflowRuleComplete(rule),
      })),
    }));
  });
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
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
