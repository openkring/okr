// libs/content/pdf-template/feature/src/lib/mailing-list.ts
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar,
} from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { MailingView, mailingStateColor } from '@okr/content-pdf-template-util';
import { contextMenuId, prettyFormatDateTime } from '@okr/shared-util-core';
import { Menu } from '@okr/cms-menu-feature';

import { MailingStore } from './mailing.store';
import { MailingSegments } from './mailing-segments';

/**
 * The tenant's sent Versände (spec 1.145), newest first — the answer to «where do I see the status of
 * a send?». Read-only: a row opens the detail page; there is nothing to edit, the server owns the docs.
 *
 * Route: `/mailings/:listId` behind `isMemberAdminGuard`, which is the read rule of `mailings` too.
 * `listId` is `all` for now; it is kept so a later partition (one group's sends) needs no new route.
 */
@Component({
  selector: 'okr-mailing-list',
  standalone: true,
  providers: [MailingStore],
  imports: [
    SvgIconPipe, Spinner, ListFilter, EmptyList, IonButton, IonIcon,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip, IonPopover, Menu, MailingSegments,
  ],
  styles: [`
    ion-row { cursor: pointer; border-bottom: 1px solid var(--ion-color-light); }
    .m-subject { font-size: 1rem; margin: 0; }
    .m-meta { font-size: 0.8rem; color: var(--ion-color-medium); margin: 0; }
    ion-chip { font-size: 0.75rem; height: 22px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.list_title() }}</ion-title>
        <!-- «Neuen Versand erstellen» (menuItems c-mailings) -->
        <ion-buttons slot="end">
          <ion-button [id]="popupId">
            <ion-icon slot="icon-only" [src]="'ellipsis-vertical' | svgIcon" />
          </ion-button>
          <ion-popover [trigger]="popupId" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content>
                <okr-menu [menuName]="contextMenuName" />
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>
      <!-- the Versände and the status board of all letters sent through the post provider (spec 1.150 §9) -->
      <okr-mailing-segments active="overview" [overviewLabel]="store.i18n.segment_overview()" [lettersLabel]="store.sendingI18n.list_title()" />
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
      <ion-toolbar color="primary" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="5"><ion-label><strong>{{ store.i18n.subject() }}</strong></ion-label></ion-col>
            <ion-col size="3" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.sender() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.recipients() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.state() }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (store.isLoading() && count() === 0) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for (mailing of store.filteredMailings(); track mailing.okey) {
            <ion-row (click)="open(mailing)">
              <ion-col size="9" size-md="5">
                <ion-label>
                  <p class="m-subject">{{ mailing.subject || store.i18n.no_subject() }}</p>
                  <p class="m-meta">{{ date(mailing) }}<span class="ion-hide-md-up"> · {{ mailing.senderName }}</span></p>
                </ion-label>
              </ion-col>
              <ion-col size="3" class="ion-hide-md-down ion-align-self-center">
                <ion-label>{{ mailing.senderName }}</ion-label>
              </ion-col>
              <ion-col size="2" class="ion-hide-md-down ion-align-self-center">
                <ion-label>
                  <p class="m-meta">{{ counts(mailing) }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="3" size-md="2" class="ion-align-self-center">
                <ion-chip [outline]="true" [color]="color(mailing)">{{ stateLabel(mailing) }}</ion-chip>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `,
})
export class MailingList {
  protected readonly store = inject(MailingStore);
  private readonly router = inject(Router);

  /** route segment; 'all' until the list gets a partition */
  public readonly listId = input('all');
  /** the context menu (menuItems). A constant, not an input: route input binding would set an unbound input to undefined */
  protected readonly contextMenuName = 'c-mailings';
  protected readonly popupId = contextMenuId('c_mailing_list');

  protected readonly count = computed(() => this.store.mailings().length);
  protected readonly filteredCount = computed(() => this.store.filteredMailings().length);

  protected date(mailing: MailingView): string {
    return prettyFormatDateTime(mailing.createdAt);
  }

  /** '12 E-Mails · 3 Mitteilungen · 2 Briefe' — what the server actually created, once it is through. */
  protected counts(mailing: MailingView): string {
    const parts: string[] = [];
    if (mailing.state !== 'pending') {
      if (mailing.emails) parts.push(`${mailing.emails} ${this.store.i18n.emails()}`);
      if (mailing.notices) parts.push(`${mailing.notices} ${this.store.i18n.notices()}`);
      if (mailing.letters?.count) parts.push(`${mailing.letters.count} ${this.store.i18n.letters_count()}`);
    }
    return parts.length > 0 ? parts.join(' · ') : `${mailing.deliveries?.length ?? 0} ${this.store.i18n.recipients()}`;
  }

  protected color(mailing: MailingView): string {
    return mailingStateColor(mailing.state, mailing.letters?.state === 'failed');
  }

  protected stateLabel(mailing: MailingView): string {
    switch (mailing.state) {
      case 'sent': return this.store.i18n.state_sent();
      case 'failed': return this.store.i18n.state_failed();
      default: return this.store.i18n.state_pending();
    }
  }

  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape)
    switch (selectedMethod) {
      case 'newVersand': await this.store.newVersand(); break;
      default: console.error(`MailingList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async open(mailing: MailingView): Promise<void> {
    await this.router.navigate(['/mailings', 'view', mailing.okey]);
  }
}
