import { Component, computed, inject, input } from '@angular/core';
import { IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ApprovalModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { keepDefaultTrue } from '@okr/shared-util-angular';

import { approvalStateColor, getApprovalSummary } from '@okr/system-workflow-util';

import { ApprovalScope, ApprovalStore } from './approval.store';

/**
 * The approver's inbox (spec 2026-08-15-approval-workflow-spec.md §3.5).
 *
 * Entry point is normally the TASK the approval opened — its FCM push is the
 * notification, and its relatedKey deep-links here. This list is the overview for
 * someone who wants to see everything at once.
 */
@Component({
  selector: 'okr-approval-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, ListFilter, EmptyList,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSegment, IonSegmentButton
  ],
  providers: [ApprovalStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        @if(showMenuButton()) {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        }
        <ion-title>{{ filteredCount() }}/{{ totalCount() }} {{ store.i18n.approval_plural() }}</ion-title>
        <ion-buttons slot="end">
          <!-- decided approvals are hidden by default: the pending ones are the work -->
          <ion-button (click)="store.toggleDecided()">
            <ion-icon slot="icon-only" src="{{ (showDecided() ? 'eye' : 'eye-off') | svgIcon }}" />
          </ion-button>
          <ion-button (click)="store.export()">
            <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="scope()" (ionChange)="onScopeChange($any($event.detail.value))">
          <ion-segment-button value="mine">{{ store.i18n.approval_mine() }}</ion-segment-button>
          @if (isAdmin()) {
            <ion-segment-button value="unassigned">{{ store.i18n.approval_unassigned() }}</ion-segment-button>
            <ion-segment-button value="all">{{ store.i18n.approval_all() }}</ion-segment-button>
          }
        </ion-segment>
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="onSearchTermChange($event)" />
    </ion-header>

    <ion-content>
      @if(isLoading()) {
        <okr-spinner />
      } @else {
        @if(filteredCount() === 0) {
          <okr-empty-list [message]="store.i18n.approval_empty()" />
        } @else {
          <ion-list>
            @for(approval of filteredApprovals(); track approval.okey) {
              <ion-item (click)="store.open(approval)">
                <ion-icon slot="start" src="{{ 'check-double' | svgIcon }}" />
                <ion-label>
                  <h3>{{ approval.subjectName || approval.subjectKey }}</h3>
                  <p>{{ summary(approval) }}</p>
                </ion-label>
                <ion-badge slot="end" [color]="stateColor(approval)">{{ approval.state }}</ion-badge>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class ApprovalList {
  protected readonly store = inject(ApprovalStore);

  // inputs
  public readonly listId = input('all');
  // keepDefaultTrue: withComponentInputBinding() would otherwise set this to undefined on
  // standalone routes, which hides the main-menu hamburger.
  public showMenuButton = input(true, { transform: keepDefaultTrue });

  // data
  protected readonly filteredApprovals = computed(() => this.store.filteredApprovals());
  protected readonly totalCount = computed(() => this.store.approvals().length);
  protected readonly filteredCount = computed(() => this.filteredApprovals().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly isAdmin = computed(() => this.store.isAdmin());
  protected readonly scope = computed(() => this.store.scope());
  protected readonly showDecided = computed(() => this.store.showDecided());

  /******************************** setters ******************************************* */
  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onScopeChange(scope: ApprovalScope): void {
    this.store.setScope(scope);
  }

  /******************************* helpers *************************************** */
  protected summary(approval: ApprovalModel): string {
    return getApprovalSummary(approval);
  }

  protected stateColor(approval: ApprovalModel): string {
    return approvalStateColor(approval.state ?? 'pending');
  }
}
