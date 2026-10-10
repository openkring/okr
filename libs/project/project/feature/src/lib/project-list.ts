import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import {
  ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon,
  IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPopover, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { DEFAULT_PROJECT_STATE } from '@okr/shared-constants';
import { AvatarPipe } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import { ProjectModel } from '@okr/shared-models';
import { TranslatePipe } from '@okr/shared-i18n';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error, resourceParams } from '@okr/shared-util-angular';
import { AccountService } from '@okr/finance-account-data-access';
import { formatMinorAmount } from '@okr/finance-booking-util';
import { ReportingService } from '@okr/finance-reporting-data-access';
import { ProjectBudgetRow, projectBudgetSummary } from '@okr/finance-reporting-util';

import { PROJECT_I18N_SCOPE } from '@okr/project-project-util';
import { ProjectStore } from './project.store';

/**
 * All (non-archived) projects of the tenant, newest start first. Actions: *add* in the context
 * menu; open / edit / duplicate / delete per row through the ActionSheet. Staff only (the route
 * carries isPrivilegedGuard). The context-menu toggle *toggleBudget* switches to the budget comparison
 * (spec 1.65 D25): per project Einnahmen, Ausgaben, Ergebnis — Budget · Ist · Abweichung — from the app's
 * default books (`defaultAccountingTenantId`, never the app tenant), loaded only while the view is on.
 */
@Component({
  selector: 'okr-project-list',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, PrettyDatePipe, AvatarPipe,
    Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonAvatar, IonImg, IonChip, IonPopover, IonNote
  ],
  providers: [ProjectStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; }
    ion-chip { font-size: 0.75rem; height: 22px; }
    .name { min-width: 50% !important; }
    .budget { display: flex; flex-wrap: wrap; gap: 4px 16px; font-variant-numeric: tabular-nums; font-size: 0.8rem; }
    .budget span { min-width: 150px; }
    .negative { color: var(--ion-color-danger); }
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
              <ion-content><okr-menu [menuName]="contextMenuName()" [toggleStates]="{ toggleBudget: budgetView() }" /></ion-content>
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
      @if (budgetView() && !books()) {
        <ion-note class="ion-padding">{{ store.i18n.budget_noBooks() }}</ion-note>
      }
      @if (store.isLoading() || (budgetView() && budgetLoading())) {
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
              <ion-label class="name ion-text-wrap">
                {{ project.name }}
                @if (budgetView()) {
                  @let b = budgetOf(project);
                  @if (b) {
                    <div class="budget">
                      <span>{{ store.i18n.budget_col_revenue() }}: {{ fmt(b.revenue.actual) }} / {{ fmt(b.revenue.budget) }}</span>
                      <span>{{ store.i18n.budget_col_expense() }}: {{ fmt(b.expense.actual) }} / {{ fmt(b.expense.budget) }}</span>
                      <span [class.negative]="b.net.diff < 0">{{ store.i18n.budget_col_net() }}: {{ fmt(b.net.actual) }} / {{ fmt(b.net.budget) }} ({{ store.i18n.budget_col_diff() }} {{ fmt(b.net.diff) }})</span>
                    </div>
                  }
                }
              </ion-label>
              @if (project.startDate && !budgetView()) {
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

  /*-------------------------- budget comparison (spec 1.65 D25) --------------------------------*/
  private readonly reportingService = inject(ReportingService);
  private readonly accountService = inject(AccountService);
  protected readonly budgetView = signal(false);
  /** the app's default books — never the app tenant ('' = none: a hint instead of numbers) */
  protected readonly books = computed(() => this.store.appStore.appConfig().defaultAccountingTenantId ?? '');
  private readonly booksParam = resourceParams(() => ({ id: this.budgetView() ? this.books() : '' }));
  private readonly linesResource = rxResource({ params: this.booksParam, stream: ({ params }) => params.id ? this.reportingService.getAllLines(params.id) : of([]) });
  private readonly bookingsResource = rxResource({ params: this.booksParam, stream: ({ params }) => params.id ? this.reportingService.getJournalEntries(params.id) : of([]) });
  private readonly accountsResource = rxResource({ params: this.booksParam, stream: ({ params }) => params.id ? this.accountService.list(params.id) : of([]) });
  protected readonly budgetLoading = computed(() => this.linesResource.isLoading() || this.bookingsResource.isLoading() || this.accountsResource.isLoading());
  private readonly budgets = computed(() => {
    const out = new Map<string, { revenue: ProjectBudgetRow; expense: ProjectBudgetRow; net: ProjectBudgetRow }>();
    if (!this.budgetView() || !this.books()) return out;
    const lines = this.linesResource.value() ?? [];
    const bookings = this.bookingsResource.value() ?? [];
    const accounts = this.accountsResource.value() ?? [];
    for (const p of this.store.filteredProjects()) {
      out.set(p.okey, projectBudgetSummary(p.okey, p.budgetedRevenue?.amount ?? 0, p.budgetedExpenses?.amount ?? 0, lines, bookings, accounts));
    }
    return out;
  });

  protected budgetOf(project: ProjectModel) {
    return this.budgets().get(project.okey);
  }

  protected fmt(minor: number): string {
    return formatMinorAmount(minor);
  }
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
      case 'toggleBudget': this.budgetView.update(v => !v); break;
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
